using System.Net;
using System.Net.Http.Json;
using Kompanion.Api.Data;
using Kompanion.Api.Jobs;
using Kompanion.Api.Models;
using Kompanion.Api.Services;
using Kompanion.Api.Services.Mail;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace Kompanion.Api.Tests;

public sealed class SignalDataTests : IAsyncLifetime
{
    private readonly FakeMailTestFactory _factory = new();
    public ValueTask InitializeAsync() => _factory.InitializeAsync();
    public ValueTask DisposeAsync() => _factory.DisposeAsync();

    private async Task<(ApiFixture.Session Admin, Guid Connection, Guid Thread, long Message)> Seed()
    {
        var admin = await ApiFixture.RegisterAdminAsync(_factory);
        var (connection, thread, message) = await ApiFixture.SeedThreadAsync(_factory, admin.UserId);
        return (admin, connection, thread, message);
    }

    private static object Reply(Guid connection, Guid thread, string key) => new
    {
        mailboxConnectionId = connection, replyToThreadId = thread, toAddrs = "receiver@test.local",
        bodyText = "Accepted reply", idempotencyKey = key
    };

    private static DateTimeOffset TruncateToMicroseconds(DateTimeOffset value) =>
        new(value.Ticks - value.Ticks % TimeSpan.TicksPerMicrosecond, value.Offset);

    private async Task<(Guid Company, Guid Project)> Project(int orgId)
    {
        await using var db = _factory.NewDbContext();
        var company = new Company { OrganizationId = orgId, Name = "Signal client" };
        var project = new Project { Company = company, Name = "Launch" };
        db.Projects.Add(project);
        await db.SaveChangesAsync(TestContext.Current.CancellationToken);
        return (company.Id, project.Id);
    }

    [Fact]
    public async Task State_changes_are_org_shared_audited_and_returned_in_mail_responses()
    {
        var (admin, connection, thread, _) = await Seed();
        var member = await ApiFixture.InviteAndRegisterAsync(_factory, admin, "member@test.local");
        var result = await member.Client.PostAsJsonAsync($"/api/mail/threads/{thread}/state", new { state = "Done" }, TestContext.Current.CancellationToken);
        result.EnsureSuccessStatusCode();
        var state = (await result.Content.ReadFromJsonAsync<ThreadStateDto>(TestContext.Current.CancellationToken))!;
        Assert.Equal("Done", state.ReplyState);
        var detail = (await admin.Client.GetFromJsonAsync<ThreadDetailDto>($"/api/mail/threads/{thread}", TestContext.Current.CancellationToken))!;
        Assert.Equal("Done", detail.ReplyState);
        var list = (await admin.Client.GetFromJsonAsync<ThreadListResponse>($"/api/mail/threads?connectionId={connection}", TestContext.Current.CancellationToken))!;
        Assert.Equal(TruncateToMicroseconds(state.StateSince), TruncateToMicroseconds(Assert.Single(list.Items).StateSince));
        (await member.Client.PostAsJsonAsync($"/api/mail/threads/{thread}/state", new { state = "Done" }, TestContext.Current.CancellationToken)).EnsureSuccessStatusCode();
        await using var db = _factory.NewDbContext();
        var audit = Assert.Single(await db.AuditLogEntries.Where(a => a.Action == "mail.thread.state").ToListAsync(TestContext.Current.CancellationToken));
        Assert.Equal(member.UserId, audit.ActorUserId);
        Assert.Contains(thread.ToString(), audit.Details);
        (await admin.Client.PostAsJsonAsync($"/api/mail/threads/{thread}/state", new { state = "ToReply" }, TestContext.Current.CancellationToken)).EnsureSuccessStatusCode();
        Assert.Equal("ToReply", (await admin.Client.GetFromJsonAsync<ThreadDetailDto>($"/api/mail/threads/{thread}", TestContext.Current.CancellationToken))!.ReplyState);
    }

    [Theory]
    [InlineData("Awaiting")]
    [InlineData("unknown")]
    [InlineData("")]
    public async Task State_rejects_invalid_values(string state)
    {
        var (admin, _, thread, _) = await Seed();
        Assert.Equal(HttpStatusCode.BadRequest,
            (await admin.Client.PostAsJsonAsync($"/api/mail/threads/{thread}/state", new { state }, TestContext.Current.CancellationToken)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound,
            (await admin.Client.PostAsJsonAsync($"/api/mail/threads/{Guid.NewGuid()}/state", new { state = "Done" }, TestContext.Current.CancellationToken)).StatusCode);
    }

    [Fact]
    public async Task Accepted_reply_records_received_gap_sender_client_and_deduplicates_samples()
    {
        var (admin, connection, thread, message) = await Seed();
        var received = DateTimeOffset.UtcNow.AddHours(-2);
        await using (var db = _factory.NewDbContext())
        {
            var company = new Company { OrganizationId = (await db.Users.FindAsync([admin.UserId], TestContext.Current.CancellationToken))!.OrganizationId, Name = "Client" };
            db.ThreadCompanies.Add(new ThreadCompany { ThreadId = thread, Company = company });
            var inbound = (await db.MailMessages.FindAsync([message], TestContext.Current.CancellationToken))!;
            inbound.InternalDate = received;
            inbound.MessageDate = received.AddDays(-1);
            await db.SaveChangesAsync(TestContext.Current.CancellationToken);
        }
        var payload = Reply(connection, thread, "reply-1");
        (await admin.Client.PostAsJsonAsync("/api/mail/send", payload, TestContext.Current.CancellationToken)).EnsureSuccessStatusCode();
        (await admin.Client.PostAsJsonAsync("/api/mail/send", payload, TestContext.Current.CancellationToken)).EnsureSuccessStatusCode();
        (await admin.Client.PostAsJsonAsync("/api/mail/send", Reply(connection, thread, "reply-2"), TestContext.Current.CancellationToken)).EnsureSuccessStatusCode();
        await using var check = _factory.NewDbContext();
        var sample = Assert.Single(await check.ThreadResponseTimes.Include(r => r.Company).ToListAsync(TestContext.Current.CancellationToken));
        Assert.Equal(admin.UserId, sample.UserId);
        Assert.Equal(thread, sample.ThreadId);
        Assert.Equal("Client", sample.Company!.Name);
        Assert.InRange(sample.Seconds, 7200, 7230);
        Assert.Equal(TruncateToMicroseconds(received), TruncateToMicroseconds(sample.ReceivedAt));
        Assert.Equal(ReplyState.Awaiting, (await check.MailThreads.FindAsync([thread], TestContext.Current.CancellationToken))!.ReplyState);
        var stats = (await admin.Client.GetFromJsonAsync<ResponseTimesDto>("/api/stats/response-times?by=client&days=30", TestContext.Current.CancellationToken))!;
        Assert.Equal(1, stats.Count);
        Assert.Equal("Client", Assert.Single(stats.Groups).Name);
        var users = (await admin.Client.GetFromJsonAsync<ResponseTimesDto>("/api/stats/response-times?by=user", TestContext.Current.CancellationToken))!;
        Assert.Equal(admin.UserId, Assert.Single(users.Groups).Id);
    }

    [Fact]
    public async Task Response_receipt_order_does_not_change_reply_headers_or_default_recipient()
    {
        var ct = TestContext.Current.CancellationToken;
        var (admin, connection, thread, message) = await Seed();
        var now = TruncateToMicroseconds(DateTimeOffset.UtcNow);
        var received = now.AddHours(-2);
        await using (var db = _factory.NewDbContext())
        {
            var original = (await db.MailMessages.FindAsync([message], ct))!;
            original.MessageId = "header-context@test.local";
            original.FromAddr = "header-sender@test.local";
            original.MessageDate = now.AddHours(-1);
            original.InternalDate = now.AddHours(-4);
            original.HeaderReferences = ["root@test.local"];
            db.MailMessages.Add(new MailMessage
            {
                MailboxConnectionId = connection, FolderId = original.FolderId, ThreadId = thread,
                Uid = 2, UidValidity = original.UidValidity, MessageId = "receipt-context@test.local",
                FromAddr = "receipt-sender@test.local", MessageDate = now.AddHours(-3), InternalDate = received
            });
            await db.SaveChangesAsync(ct);
        }
        (await admin.Client.PostAsJsonAsync("/api/mail/send", new
        {
            mailboxConnectionId = connection, replyToThreadId = thread,
            bodyText = "Reply with original context", idempotencyKey = "different-date-orders"
        }, ct)).EnsureSuccessStatusCode();
        var sent = Assert.Single(_factory.Smtp.Sent);
        Assert.Equal("header-context@test.local", sent.InReplyTo);
        Assert.Equal(new[] { "root@test.local", "header-context@test.local" }, sent.References);
        Assert.Equal("header-sender@test.local", Assert.Single(sent.To.Mailboxes).Address);
        await using var check = _factory.NewDbContext();
        var sample = await check.ThreadResponseTimes.SingleAsync(ct);
        Assert.Equal("receipt-context@test.local", sample.InboundMessageKey);
        Assert.Equal(received, TruncateToMicroseconds(sample.ReceivedAt));
    }

    [Fact]
    public async Task Failed_send_does_not_change_state_or_record_a_response()
    {
        var (admin, connection, thread, _) = await Seed();
        _factory.Smtp.OnSend = _ => new IOException("Scripted failure");
        Assert.Equal(HttpStatusCode.BadGateway,
            (await admin.Client.PostAsJsonAsync("/api/mail/send", Reply(connection, thread, "failed"), TestContext.Current.CancellationToken)).StatusCode);
        await using var db = _factory.NewDbContext();
        Assert.Empty(await db.ThreadResponseTimes.ToListAsync(TestContext.Current.CancellationToken));
        Assert.Equal(ReplyState.ToReply, (await db.MailThreads.FindAsync([thread], TestContext.Current.CancellationToken))!.ReplyState);
    }

    [Fact]
    public async Task Reply_to_outbound_sets_awaiting_without_response_sample()
    {
        var (admin, connection, thread, message) = await Seed();
        await using (var db = _factory.NewDbContext())
        {
            (await db.MailMessages.FindAsync([message], TestContext.Current.CancellationToken))!.FromAddr = (await db.MailboxConnections.FindAsync([connection], TestContext.Current.CancellationToken))!.Email.ToUpperInvariant();
            await db.SaveChangesAsync(TestContext.Current.CancellationToken);
        }
        (await admin.Client.PostAsJsonAsync("/api/mail/send", Reply(connection, thread, "outbound"), TestContext.Current.CancellationToken)).EnsureSuccessStatusCode();
        await using var check = _factory.NewDbContext();
        Assert.Empty(await check.ThreadResponseTimes.ToListAsync(TestContext.Current.CancellationToken));
        Assert.Equal(ReplyState.Awaiting, (await check.MailThreads.FindAsync([thread], TestContext.Current.CancellationToken))!.ReplyState);
    }

    [Fact]
    public async Task Ingest_opens_new_inbound_preserves_done_on_repeat_and_reopens_on_new_mail()
    {
        var (admin, connection, _, _) = await Seed();
        _factory.Mail.Folder("INBOX").Messages[5] = new FakeMessageState
        {
            MessageId = "<first@test.local>",
            BuildMime = () => FakeMailSessionFactory.BuildMime("<first@test.local>", "Launch", "client@test.local")
        };
        async Task Sync()
        {
            using var scope = _factory.Services.CreateScope();
            await scope.ServiceProvider.GetRequiredService<MailIngestor>().SyncMailboxAsync(connection, TestContext.Current.CancellationToken);
        }
        await Sync();
        Guid id;
        await using (var db = _factory.NewDbContext())
        {
            var thread = await db.MailThreads.SingleAsync(TestContext.Current.CancellationToken);
            Assert.Equal(ReplyState.ToReply, thread.ReplyState);
            id = thread.Id;
        }
        (await admin.Client.PostAsJsonAsync($"/api/mail/threads/{id}/state", new { state = "Done" }, TestContext.Current.CancellationToken)).EnsureSuccessStatusCode();
        await Sync();
        await using (var db = _factory.NewDbContext()) Assert.Equal(ReplyState.Done, (await db.MailThreads.FindAsync([id], TestContext.Current.CancellationToken))!.ReplyState);
        _factory.Mail.Folder("INBOX").Messages[6] = new FakeMessageState
        {
            MessageId = "<second@test.local>",
            BuildMime = () => FakeMailSessionFactory.BuildMime("<second@test.local>", "Re: Launch", "client@test.local")
        };
        await Sync();
        await using var final = _factory.NewDbContext();
        Assert.Equal(ReplyState.ToReply, (await final.MailThreads.FindAsync([id], TestContext.Current.CancellationToken))!.ReplyState);
    }

    [Fact]
    public async Task Daily_nudge_marks_only_awaiting_older_than_three_days_and_is_idempotent()
    {
        var (admin, _, thread, _) = await Seed();
        var (_, boundary, _) = await ApiFixture.SeedThreadAsync(_factory, admin.UserId, "Boundary");
        var (_, done, _) = await ApiFixture.SeedThreadAsync(_factory, admin.UserId, "Done");
        var now = TruncateToMicroseconds(DateTimeOffset.UtcNow);
        await using var db = _factory.NewDbContext();
        foreach (var t in await db.MailThreads.ToListAsync(TestContext.Current.CancellationToken))
        {
            t.ReplyState = t.Id == done ? ReplyState.Done : ReplyState.Awaiting;
            t.StateSince = t.Id == boundary ? now.AddDays(-3) : now.AddDays(-4);
        }
        await db.SaveChangesAsync(TestContext.Current.CancellationToken);
        var job = new FollowUpJobs(db);
        Assert.Equal(1, await job.MarkNeedsNudgeAtAsync(now, TestContext.Current.CancellationToken));
        Assert.Equal(0, await job.MarkNeedsNudgeAtAsync(now, TestContext.Current.CancellationToken));
        db.ChangeTracker.Clear();
        Assert.True((await db.MailThreads.FindAsync([thread], TestContext.Current.CancellationToken))!.NeedsNudge);
        Assert.False((await db.MailThreads.FindAsync([boundary], TestContext.Current.CancellationToken))!.NeedsNudge);
        Assert.False((await db.MailThreads.FindAsync([done], TestContext.Current.CancellationToken))!.NeedsNudge);
        (await admin.Client.PostAsJsonAsync($"/api/mail/threads/{thread}/state", new { state = "Done" }, TestContext.Current.CancellationToken)).EnsureSuccessStatusCode();
        db.ChangeTracker.Clear();
        Assert.False((await db.MailThreads.FindAsync([thread], TestContext.Current.CancellationToken))!.NeedsNudge);
        Assert.Empty(await db.MailDrafts.ToListAsync(TestContext.Current.CancellationToken));
        Assert.Equal(0, _factory.Smtp.SendCount);
    }

    [Fact]
    public async Task Flights_create_list_edit_delete_and_validate_dates()
    {
        var (admin, _, _, _) = await Seed();
        await using var db = _factory.NewDbContext();
        var (_, project) = await Project((await db.Users.FindAsync([admin.UserId], TestContext.Current.CancellationToken))!.OrganizationId);
        var url = $"/api/projects/{project}/flights";
        var created = await admin.Client.PostAsJsonAsync(url, new { siteName = " Westlands ", startDate = "2026-11-01", endDate = "2026-11-30" }, TestContext.Current.CancellationToken);
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        var flight = (await created.Content.ReadFromJsonAsync<ProjectFlightDto>(TestContext.Current.CancellationToken))!;
        Assert.Equal("Westlands", flight.SiteName);
        Assert.Single((await admin.Client.GetFromJsonAsync<List<ProjectFlightDto>>(url, TestContext.Current.CancellationToken))!);
        var edit = await admin.Client.PatchAsJsonAsync($"{url}/{flight.Id}", new { siteName = "CBD", startDate = "2026-11-02", endDate = "2026-11-02" }, TestContext.Current.CancellationToken);
        edit.EnsureSuccessStatusCode();
        Assert.Equal("CBD", (await edit.Content.ReadFromJsonAsync<ProjectFlightDto>(TestContext.Current.CancellationToken))!.SiteName);
        Assert.Equal(HttpStatusCode.BadRequest, (await admin.Client.PostAsJsonAsync(url,
            new { siteName = "Site", startDate = "2026-11-30", endDate = "2026-11-01" }, TestContext.Current.CancellationToken)).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await admin.Client.PatchAsJsonAsync($"{url}/{flight.Id}",
            new { siteName = " ", startDate = "2026-11-01", endDate = "2026-11-01" }, TestContext.Current.CancellationToken)).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await admin.Client.DeleteAsync($"{url}/{flight.Id}", TestContext.Current.CancellationToken)).StatusCode);
        Assert.Empty((await admin.Client.GetFromJsonAsync<List<ProjectFlightDto>>(url, TestContext.Current.CancellationToken))!);
        Assert.Equal(HttpStatusCode.NotFound, (await admin.Client.DeleteAsync($"{url}/{flight.Id}", TestContext.Current.CancellationToken)).StatusCode);
    }

    [Theory]
    [InlineData("by=other")]
    [InlineData("days=0")]
    [InlineData("days=366")]
    public async Task Stats_validates_query(string query)
    {
        var (admin, _, _, _) = await Seed();
        Assert.Equal(HttpStatusCode.BadRequest, (await admin.Client.GetAsync($"/api/stats/response-times?{query}", TestContext.Current.CancellationToken)).StatusCode);
    }

    [Fact]
    public async Task Brief_scopes_waiting_by_assignment_and_flights_to_seven_business_dates()
    {
        var (admin, _, owned, _) = await Seed();
        var colleague = await ApiFixture.InviteAndRegisterAsync(_factory, admin, "colleague@test.local");
        var (_, assigned, _) = await ApiFixture.SeedThreadAsync(_factory, colleague.UserId, "Assigned to admin");
        var (_, other, _) = await ApiFixture.SeedThreadAsync(_factory, colleague.UserId, "Colleague work");
        await using var db = _factory.NewDbContext();
        db.ThreadAssignments.Add(new ThreadAssignment { ThreadId = assigned, UserId = admin.UserId, AssignedByUserId = colleague.UserId });
        (await db.MailThreads.FindAsync([other], TestContext.Current.CancellationToken))!.ReplyState = ReplyState.Awaiting;
        var (_, project) = await Project((await db.Users.FindAsync([admin.UserId], TestContext.Current.CancellationToken))!.OrganizationId);
        var today = SignalMetrics.BusinessDate(DateTimeOffset.UtcNow);
        db.ProjectFlights.AddRange(
            new ProjectFlight { ProjectId = project, SiteName = "Today", StartDate = today, EndDate = today },
            new ProjectFlight { ProjectId = project, SiteName = "Day six", StartDate = today.AddDays(6), EndDate = today.AddDays(6) },
            new ProjectFlight { ProjectId = project, SiteName = "Too far", StartDate = today.AddDays(7), EndDate = today.AddDays(7) });
        await db.SaveChangesAsync(TestContext.Current.CancellationToken);
        var brief = (await admin.Client.GetFromJsonAsync<MailBriefDto>("/api/mail/brief", TestContext.Current.CancellationToken))!;
        Assert.Equal(3, brief.UnreadCount);
        Assert.Equal(new[] { owned, assigned }.Order(), brief.WaitingOnMe.Select(t => t.Id).Order());
        Assert.All(brief.WaitingOnMe, t => Assert.True(t.WaitingSeconds >= 0));
        Assert.Equal(1, brief.AwaitingCount);
        Assert.Equal(2, brief.UpcomingFlights.Count);
        Assert.All(brief.UpcomingFlights, f => Assert.Equal("Signal client", f.Client));
        Assert.Equal(7, brief.FirstReply.Daily.Count);
        Assert.All(brief.FirstReply.Daily, d => Assert.DoesNotContain(d.Date.DayOfWeek, new[] { DayOfWeek.Saturday, DayOfWeek.Sunday }));
        Assert.Null(brief.FirstReply.MedianSeconds);
    }

    [Theory]
    [InlineData("/api/mail/brief")]
    [InlineData("/api/stats/response-times")]
    [InlineData("/api/projects/00000000-0000-0000-0000-000000000000/flights")]
    public async Task New_reads_require_authentication(string path) =>
        Assert.Equal(HttpStatusCode.Unauthorized, (await _factory.CreateClient().GetAsync(path, TestContext.Current.CancellationToken)).StatusCode);

    [Fact]
    public async Task Migration_backfills_existing_threads_from_latest_message_direction()
    {
        var (admin, connection, inboundThread, _) = await Seed();
        var (sentConnection, sentThread, sentMessage) = await ApiFixture.SeedThreadAsync(_factory, admin.UserId, "Sent");
        var (_, ownThread, ownMessage) = await ApiFixture.SeedThreadAsync(_factory, admin.UserId, "Own sender");
        await using var db = _factory.NewDbContext();
        (await db.MailMessages.Include(m => m.Folder).SingleAsync(m => m.Id == sentMessage, TestContext.Current.CancellationToken)).Folder.SpecialUse = FolderSpecialUse.Sent;
        var own = (await db.MailMessages.FindAsync([ownMessage], TestContext.Current.CancellationToken))!;
        own.FromAddr = (await db.MailboxConnections.FindAsync([own.MailboxConnectionId], TestContext.Current.CancellationToken))!.Email.ToUpperInvariant();
        var empty = new MailThread { MailboxConnectionId = connection, RootKey = "empty" };
        db.MailThreads.Add(empty);
        await db.SaveChangesAsync(TestContext.Current.CancellationToken);
        await db.GetService<IMigrator>().MigrateAsync("20261008005845_SendGuards", TestContext.Current.CancellationToken);
        await db.GetService<IMigrator>().MigrateAsync(cancellationToken: TestContext.Current.CancellationToken);
        db.ChangeTracker.Clear();
        Assert.Equal(ReplyState.ToReply, (await db.MailThreads.FindAsync([inboundThread], TestContext.Current.CancellationToken))!.ReplyState);
        Assert.Equal(ReplyState.Awaiting, (await db.MailThreads.FindAsync([sentThread], TestContext.Current.CancellationToken))!.ReplyState);
        Assert.Equal(ReplyState.Awaiting, (await db.MailThreads.FindAsync([ownThread], TestContext.Current.CancellationToken))!.ReplyState);
        Assert.Equal(ReplyState.ToReply, (await db.MailThreads.FindAsync([empty.Id], TestContext.Current.CancellationToken))!.ReplyState);
        Assert.All(await db.MailThreads.ToListAsync(TestContext.Current.CancellationToken), t => Assert.True(t.StateSince > DateTimeOffset.MinValue));
        Assert.False(db.Database.HasPendingModelChanges());
    }

    [Fact]
    public void Working_dates_and_median_cover_weekend_empty_even_and_odd_samples()
    {
        var dates = SignalMetrics.WorkingDates(new DateTimeOffset(2026, 10, 25, 12, 0, 0, TimeSpan.Zero), 7);
        Assert.Equal(new DateOnly(2026, 10, 23), dates[^1]);
        Assert.Equal(7, dates.Count);
        Assert.Null(SignalMetrics.Median([]));
        Assert.Equal(20, SignalMetrics.Median([30, 10, 20]));
        Assert.Equal(25, SignalMetrics.Median([40, 10, 30, 20]));
    }

    [Fact]
    public async Task Foreign_org_threads_flights_and_metrics_are_invisible()
    {
        var (admin, _, _, _) = await Seed();
        await using var db = _factory.NewDbContext();
        var org = new Organization { Name = "Foreign" };
        var outsider = new User { Organization = org, Email = "outsider@foreign.local", Username = "outsider",
            DisplayName = "Outsider", PasswordHash = "unused" };
        db.Users.Add(outsider);
        await db.SaveChangesAsync(TestContext.Current.CancellationToken);
        var (connection, thread, _) = await ApiFixture.SeedThreadAsync(_factory, outsider.Id);
        var (_, project) = await Project(org.Id);
        var date = SignalMetrics.BusinessDate(DateTimeOffset.UtcNow);
        var flight = new ProjectFlight { ProjectId = project, SiteName = "Foreign site", StartDate = date, EndDate = date };
        db.ProjectFlights.Add(flight);
        var operation = new SendOperation { MailboxConnectionId = connection, CallerUserId = outsider.Id,
            RequestKey = "foreign", PayloadHash = "unused", WireMessageId = "foreign", Status = SendOperationStatus.Accepted };
        db.ThreadResponseTimes.Add(new ThreadResponseTime { SendOperation = operation, MailboxConnectionId = connection,
            ThreadId = thread, UserId = outsider.Id, InboundMessageKey = "foreign", ReceivedAt = DateTimeOffset.UtcNow.AddMinutes(-2),
            SentAt = DateTimeOffset.UtcNow, Seconds = 120 });
        await db.SaveChangesAsync(TestContext.Current.CancellationToken);
        var url = $"/api/projects/{project}/flights";
        var body = new { siteName = "X", startDate = date, endDate = date };
        Assert.Equal(HttpStatusCode.NotFound, (await admin.Client.GetAsync(url, TestContext.Current.CancellationToken)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await admin.Client.PostAsJsonAsync(url, body, TestContext.Current.CancellationToken)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await admin.Client.PatchAsJsonAsync($"{url}/{flight.Id}", body, TestContext.Current.CancellationToken)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await admin.Client.DeleteAsync($"{url}/{flight.Id}", TestContext.Current.CancellationToken)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await admin.Client.PostAsJsonAsync($"/api/mail/threads/{thread}/state", new { state = "Done" }, TestContext.Current.CancellationToken)).StatusCode);
        var brief = (await admin.Client.GetFromJsonAsync<MailBriefDto>("/api/mail/brief", TestContext.Current.CancellationToken))!;
        Assert.Equal(1, brief.UnreadCount);
        Assert.DoesNotContain(brief.WaitingOnMe, t => t.Id == thread);
        Assert.Empty(brief.UpcomingFlights);
        Assert.Equal(0, brief.FirstReply.Count);
        Assert.Equal(0, (await admin.Client.GetFromJsonAsync<ResponseTimesDto>("/api/stats/response-times", TestContext.Current.CancellationToken))!.Count);
    }

    [Fact]
    public async Task New_writes_require_authentication()
    {
        using var client = _factory.CreateClient();
        var id = Guid.NewGuid();
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.PostAsJsonAsync($"/api/mail/threads/{id}/state", new { state = "Done" }, TestContext.Current.CancellationToken)).StatusCode);
        var path = $"/api/projects/{id}/flights";
        var body = new { siteName = "Site", startDate = "2026-10-22", endDate = "2026-10-22" };
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.PostAsJsonAsync(path, body, TestContext.Current.CancellationToken)).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.PatchAsJsonAsync($"{path}/{id}", body, TestContext.Current.CancellationToken)).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.DeleteAsync($"{path}/{id}", TestContext.Current.CancellationToken)).StatusCode);
    }

    [Fact]
    public async Task Brief_uses_only_last_seven_working_days_and_populates_daily_medians()
    {
        var (admin, connection, thread, _) = await Seed();
        var now = new DateTimeOffset(2026, 10, 26, 10, 0, 0, TimeSpan.Zero);
        var monday = new DateTimeOffset(2026, 10, 26, 8, 0, 0, TimeSpan.Zero);
        await using var db = _factory.NewDbContext();
        var samples = new[] { (monday, 60d), (monday, 180d), (monday.AddDays(-3), 300d),
            (monday.AddDays(-1), 900d), (monday.AddDays(-20), 999d), (monday.AddDays(1), 999d) };
        foreach (var (sent, seconds) in samples)
        {
            var key = Guid.NewGuid().ToString();
            var operation = new SendOperation { MailboxConnectionId = connection, CallerUserId = admin.UserId,
                RequestKey = key, PayloadHash = "unused", WireMessageId = key, Status = SendOperationStatus.Accepted };
            db.ThreadResponseTimes.Add(new ThreadResponseTime { SendOperation = operation, MailboxConnectionId = connection,
                ThreadId = thread, UserId = admin.UserId, InboundMessageKey = key, SentAt = sent,
                ReceivedAt = sent.AddSeconds(-seconds), Seconds = seconds });
        }
        await db.SaveChangesAsync(TestContext.Current.CancellationToken);
        var orgId = (await db.Users.FindAsync([admin.UserId], TestContext.Current.CancellationToken))!.OrganizationId;
        var brief = await new SignalMetrics(db).BriefAsync(orgId, admin.UserId, now, TestContext.Current.CancellationToken);
        Assert.Equal(3, brief.FirstReply.Count);
        Assert.Equal(180, brief.FirstReply.MedianSeconds);
        Assert.Equal(120, brief.FirstReply.Daily[^1].MedianSeconds);
        Assert.Equal(2, brief.FirstReply.Daily[^1].Count);
        var stats = await new SignalMetrics(db).ResponseTimesAsync(orgId, "client", 7, now, TestContext.Current.CancellationToken);
        Assert.Equal(4, stats.Count);
        Assert.Equal("Unlinked", Assert.Single(stats.Groups).Name);
    }

    [Fact]
    public async Task Concurrent_distinct_replies_add_one_first_reply_sample()
    {
        var (admin, connection, thread, _) = await Seed();
        var responses = await Task.WhenAll(Enumerable.Range(0, 3).Select(i =>
            ApiFixture.ClientWithToken(_factory, admin.Token).PostAsJsonAsync("/api/mail/send", Reply(connection, thread, $"parallel-{i}"), TestContext.Current.CancellationToken)));
        Assert.All(responses, response => Assert.Equal(HttpStatusCode.OK, response.StatusCode));
        await using var db = _factory.NewDbContext();
        Assert.Single(await db.ThreadResponseTimes.ToListAsync(TestContext.Current.CancellationToken));
        Assert.All(await db.SendOperations.ToListAsync(TestContext.Current.CancellationToken), operation => Assert.Equal(SendOperationStatus.Accepted, operation.Status));
    }
}
