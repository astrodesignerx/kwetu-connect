using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Kompanion.Api.Data;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace Kompanion.Api.Tests;

public sealed class WorkspaceOverviewTests : IAsyncLifetime
{
    private readonly TestAppFactory _factory = new();
    public ValueTask InitializeAsync() => _factory.InitializeAsync();
    public ValueTask DisposeAsync() => _factory.DisposeAsync();
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    private async Task<User> ForeignUser()
    {
        await using var db = _factory.NewDbContext();
        var user = new User
        {
            Organization = new Organization { Name = "Other workspace" },
            Email = "outside@other.test", Username = "outside", DisplayName = "Outside",
            PasswordHash = "unused", Role = UserRole.Admin
        };
        db.Users.Add(user);
        await db.SaveChangesAsync(Ct);
        return user;
    }

    private static SendOperation Send(Guid caller, Guid mailbox, SendOperationStatus status, DateTimeOffset updated) => new()
    {
        CallerUserId = caller, MailboxConnectionId = mailbox, Status = status,
        RequestKey = Guid.NewGuid().ToString(), PayloadHash = "test", WireMessageId = Guid.NewGuid() + "@test.local",
        CreatedAt = updated, UpdatedAt = updated
    };

    [Fact]
    public async Task Overview_counts_only_this_org_and_accepted_recent_sends()
    {
        var admin = await ApiFixture.RegisterAdminAsync(_factory);
        var foreign = await ForeignUser();
        var (mailbox, _, _) = await ApiFixture.SeedThreadAsync(_factory, admin.UserId);
        var (outsideMailbox, _, _) = await ApiFixture.SeedThreadAsync(_factory, foreign.Id);
        await using (var db = _factory.NewDbContext())
        {
            var orgId = (await db.Users.FindAsync([admin.UserId], Ct))!.OrganizationId;
            (await db.MailboxConnections.FindAsync([mailbox], Ct))!.SyncState = MailboxSyncState.Error;
            db.EmailTemplates.AddRange(new EmailTemplate { OrganizationId = orgId, Name = "Our template" },
                new EmailTemplate { OrganizationId = foreign.OrganizationId, Name = "Other template" });
            db.Invitations.AddRange(
                new Invitation { OrganizationId = orgId, CreatedByUserId = admin.UserId, Email = "pending@test.local", TokenHash = "pending", ExpiresAt = DateTimeOffset.UtcNow.AddDays(1) },
                new Invitation { OrganizationId = orgId, CreatedByUserId = admin.UserId, Email = "expired@test.local", TokenHash = "expired", ExpiresAt = DateTimeOffset.UtcNow.AddDays(-1) },
                new Invitation { OrganizationId = orgId, CreatedByUserId = admin.UserId, Email = "revoked@test.local", TokenHash = "revoked", RevokedAt = DateTimeOffset.UtcNow, ExpiresAt = DateTimeOffset.UtcNow.AddDays(1) },
                new Invitation { OrganizationId = orgId, CreatedByUserId = admin.UserId, Email = "accepted@test.local", TokenHash = "accepted", AcceptedAt = DateTimeOffset.UtcNow, ExpiresAt = DateTimeOffset.UtcNow.AddDays(1) },
                new Invitation { OrganizationId = foreign.OrganizationId, CreatedByUserId = foreign.Id, Email = "outside@test.local", TokenHash = "outside", ExpiresAt = DateTimeOffset.UtcNow.AddDays(1) });
            db.SendOperations.AddRange(
                Send(admin.UserId, mailbox, SendOperationStatus.Accepted, DateTimeOffset.UtcNow.AddDays(-1)),
                Send(admin.UserId, mailbox, SendOperationStatus.Accepted, DateTimeOffset.UtcNow.AddDays(-31)),
                Send(admin.UserId, mailbox, SendOperationStatus.Failed, DateTimeOffset.UtcNow),
                Send(admin.UserId, mailbox, SendOperationStatus.Uncertain, DateTimeOffset.UtcNow),
                Send(foreign.Id, outsideMailbox, SendOperationStatus.Accepted, DateTimeOffset.UtcNow));
            await db.SaveChangesAsync(Ct);
        }
        var body = await admin.Client.GetFromJsonAsync<JsonElement>("/api/workspace/overview", Ct);
        Assert.False(string.IsNullOrWhiteSpace(body.GetProperty("workspaceName").GetString()));
        Assert.Equal(1, body.GetProperty("memberCount").GetInt32());
        Assert.Equal(1, body.GetProperty("mailboxCount").GetInt32());
        Assert.Equal(1, body.GetProperty("templateCount").GetInt32());
        Assert.Equal(1, body.GetProperty("sendsLast30Days").GetInt32());
        Assert.Equal(1, body.GetProperty("pendingInvitations").GetInt32());
        Assert.Equal(1, body.GetProperty("mailboxHealth").GetProperty("needsAttention").GetInt32());
        await using var check = _factory.NewDbContext();
        Assert.True(await check.AuditLogEntries.AnyAsync(a => a.ActorUserId == admin.UserId && a.Action == "admin.workspace.overview", Ct));
    }

    [Fact]
    public async Task Member_overview_redacts_admin_invitation_count()
    {
        var admin = await ApiFixture.RegisterAdminAsync(_factory);
        var member = await ApiFixture.InviteAndRegisterAsync(_factory, admin, "member@test.local");
        await ApiFixture.CreateInviteTokenAsync(admin, "pending@test.local");
        var body = await member.Client.GetFromJsonAsync<JsonElement>("/api/workspace/overview", Ct);
        Assert.Equal(2, body.GetProperty("memberCount").GetInt32());
        Assert.Equal(JsonValueKind.Null, body.GetProperty("pendingInvitations").ValueKind);
    }

    [Fact]
    public async Task Sync_stats_count_fetched_timestamps_and_return_null_error_history()
    {
        var admin = await ApiFixture.RegisterAdminAsync(_factory);
        var (mailbox, _, message) = await ApiFixture.SeedThreadAsync(_factory, admin.UserId);
        var foreign = await ForeignUser();
        await ApiFixture.SeedThreadAsync(_factory, foreign.Id);
        var now = DateTimeOffset.UtcNow;
        var currentHour = new DateTimeOffset(now.Year, now.Month, now.Day, now.Hour, 0, 0, TimeSpan.Zero);
        var timestamp = currentHour.AddHours(-1).AddMinutes(10);
        await using (var db = _factory.NewDbContext())
        {
            var original = (await db.MailMessages.FindAsync([message], Ct))!;
            original.FetchedAt = timestamp;
            original.MessageDate = now.AddYears(-1);
            db.MailMessages.Add(new MailMessage
            {
                MailboxConnectionId = mailbox, FolderId = original.FolderId, ThreadId = original.ThreadId,
                Uid = 2, UidValidity = 1, MessageId = "old@test.local", FromAddr = "old@test.local",
                FetchedAt = now.AddDays(-2), MessageDate = now
            });
            var box = (await db.MailboxConnections.FindAsync([mailbox], Ct))!;
            box.LastSyncCompletedAt = timestamp; box.SyncState = MailboxSyncState.Syncing;
            await db.SaveChangesAsync(Ct);
        }
        var body = await admin.Client.GetFromJsonAsync<JsonElement>($"/api/mailboxes/{mailbox}/sync-stats?hours=24", Ct);
        Assert.Equal(1, body.GetProperty("conversationCount").GetInt32());
        Assert.Equal(1, body.GetProperty("messagesSynced").GetInt32());
        Assert.Equal("Syncing", body.GetProperty("syncState").GetString());
        Assert.Equal(JsonValueKind.Null, body.GetProperty("errorCount24Hours").ValueKind);
        Assert.Equal(timestamp.ToUnixTimeSeconds(), body.GetProperty("lastSyncCompletedAt").GetDateTimeOffset().ToUnixTimeSeconds());
        var hourly = body.GetProperty("hourly").EnumerateArray().ToArray();
        Assert.Equal(24, hourly.Length);
        Assert.Equal(1, hourly.Single(h => h.GetProperty("hour").GetDateTimeOffset() == currentHour.AddHours(-1)).GetProperty("count").GetInt32());
        Assert.Equal(23, hourly.Count(h => h.GetProperty("count").GetInt32() == 0));
    }

    [Fact]
    public async Task Sync_stats_hide_other_owners_other_orgs_and_unknown_mailboxes()
    {
        var admin = await ApiFixture.RegisterAdminAsync(_factory);
        var member = await ApiFixture.InviteAndRegisterAsync(_factory, admin, "member@test.local");
        var (own, _, _) = await ApiFixture.SeedThreadAsync(_factory, admin.UserId);
        var foreign = await ForeignUser();
        var (outside, _, _) = await ApiFixture.SeedThreadAsync(_factory, foreign.Id);
        Assert.Equal(HttpStatusCode.NotFound, (await member.Client.GetAsync($"/api/mailboxes/{own}/sync-stats", Ct)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await admin.Client.GetAsync($"/api/mailboxes/{outside}/sync-stats", Ct)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await admin.Client.GetAsync($"/api/mailboxes/{Guid.NewGuid()}/sync-stats", Ct)).StatusCode);
    }

    [Fact]
    public async Task Daily_audit_aggregates_the_full_window_by_UTC_and_excludes_foreign_events()
    {
        var admin = await ApiFixture.RegisterAdminAsync(_factory);
        var foreign = await ForeignUser();
        var day = DateTimeOffset.UtcNow.Date.AddDays(-2);
        var utc = new DateTimeOffset(day.AddHours(23), TimeSpan.Zero);
        await using (var db = _factory.NewDbContext())
        {
            db.AuditLogEntries.AddRange(Enumerable.Range(0, 205).Select(_ => new AuditLogEntry
                { ActorUserId = admin.UserId, ActorEmail = admin.Email, Action = "test.view", CreatedAt = utc }));
            db.AuditLogEntries.AddRange(
                new AuditLogEntry { ActorUserId = foreign.Id, ActorEmail = foreign.Email, Action = "outside.view", CreatedAt = utc },
                new AuditLogEntry { ActorUserId = admin.UserId, ActorEmail = admin.Email, Action = "old.view", CreatedAt = utc.AddYears(-1) });
            await db.SaveChangesAsync(Ct);
        }
        var body = await admin.Client.GetFromJsonAsync<JsonElement>("/api/admin/audit-log/daily?weeks=12", Ct);
        var days = body.GetProperty("days").EnumerateArray().ToArray();
        Assert.Equal(12, body.GetProperty("weeks").GetInt32());
        Assert.Equal(205, days.Single(d => d.GetProperty("date").GetString() == day.ToString("yyyy-MM-dd")).GetProperty("count").GetInt32());
        Assert.Contains(days, d => d.GetProperty("count").GetInt32() == 0);
        Assert.Equal(DayOfWeek.Monday, DateTime.Parse(days[0].GetProperty("date").GetString()!).DayOfWeek);
        await using var check = _factory.NewDbContext();
        Assert.True(await check.AuditLogEntries.AnyAsync(a => a.Action == "admin.audit.daily.view" && a.ActorUserId == admin.UserId, Ct));
    }

    [Fact]
    public async Task Daily_audit_is_admin_only_and_all_endpoints_require_authentication()
    {
        var admin = await ApiFixture.RegisterAdminAsync(_factory);
        var member = await ApiFixture.InviteAndRegisterAsync(_factory, admin, "member@test.local");
        Assert.Equal(HttpStatusCode.Forbidden, (await member.Client.GetAsync("/api/admin/audit-log/daily", Ct)).StatusCode);
        using var anonymous = _factory.CreateClient();
        foreach (var path in new[] { "/api/workspace/overview", $"/api/mailboxes/{Guid.NewGuid()}/sync-stats", "/api/admin/audit-log/daily" })
            Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.GetAsync(path, Ct)).StatusCode);
    }

    [Theory]
    [InlineData(0)]
    [InlineData(169)]
    public async Task Sync_stats_validate_window(int hours)
    {
        var admin = await ApiFixture.RegisterAdminAsync(_factory);
        Assert.Equal(HttpStatusCode.BadRequest, (await admin.Client.GetAsync($"/api/mailboxes/{Guid.NewGuid()}/sync-stats?hours={hours}", Ct)).StatusCode);
    }

    [Theory]
    [InlineData(0)]
    [InlineData(53)]
    public async Task Daily_audit_validates_window(int weeks)
    {
        var admin = await ApiFixture.RegisterAdminAsync(_factory);
        Assert.Equal(HttpStatusCode.BadRequest, (await admin.Client.GetAsync($"/api/admin/audit-log/daily?weeks={weeks}", Ct)).StatusCode);
    }
}
