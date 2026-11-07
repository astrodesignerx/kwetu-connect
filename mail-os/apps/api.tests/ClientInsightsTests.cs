using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Kompanion.Api.Data;
using Kompanion.Api.Services;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace Kompanion.Api.Tests;

public sealed class ClientInsightsTests : IAsyncLifetime
{
    private readonly TestAppFactory _factory = new();
    private static CancellationToken Ct => TestContext.Current.CancellationToken;
    public ValueTask InitializeAsync() => _factory.InitializeAsync();
    public ValueTask DisposeAsync() => _factory.DisposeAsync();

    private async Task<(Company Company, Project Project)> Client(Guid userId, string name = "Cedar")
    {
        await using var db = _factory.NewDbContext();
        var org = await db.Users.Where(u => u.Id == userId).Select(u => u.OrganizationId).SingleAsync(Ct);
        var company = new Company { OrganizationId = org, Name = name };
        var project = new Project { Company = company, Name = "Launch" };
        db.Projects.Add(project);
        await db.SaveChangesAsync(Ct);
        return (company, project);
    }

    private static async Task<JsonElement> Read(HttpClient client, string url) =>
        await client.GetFromJsonAsync<JsonElement>(url, Ct);

    [Fact]
    public async Task Activity_deduplicates_links_and_messages_in_each_Nairobi_week()
    {
        var admin = await ApiFixture.RegisterAdminAsync(_factory);
        var (company, project) = await Client(admin.UserId);
        var (_, thread, message) = await ApiFixture.SeedThreadAsync(_factory, admin.UserId);
        var monday = SignalMetrics.BusinessDate(DateTimeOffset.UtcNow);
        monday = monday.AddDays(-(((int)monday.DayOfWeek + 6) % 7));
        var boundary = new DateTimeOffset(monday.ToDateTime(TimeOnly.MinValue), TimeSpan.FromHours(3)).ToUniversalTime();
        await using (var db = _factory.NewDbContext())
        {
            db.ThreadCompanies.Add(new ThreadCompany { CompanyId = company.Id, ThreadId = thread });
            db.ThreadProjects.Add(new ThreadProject { ProjectId = project.Id, ThreadId = thread });
            var m = (await db.MailMessages.FindAsync([message], Ct))!;
            db.ProjectFlights.Add(new ProjectFlight { ProjectId = project.Id, SiteName = "Current booking", StartDate = monday, EndDate = monday.AddDays(7) });
            m.InternalDate = boundary.AddTicks(-10);
            m.MessageDate = boundary.AddDays(-10);
            db.MailMessages.Add(new MailMessage { MailboxConnectionId = m.MailboxConnectionId, FolderId = m.FolderId,
                ThreadId = thread, Uid = 2, UidValidity = 1, MessageId = "second@test.local", InternalDate = boundary.AddTicks(-20) });
            db.MailMessages.Add(new MailMessage { MailboxConnectionId = m.MailboxConnectionId, FolderId = m.FolderId,
                ThreadId = thread, Uid = 3, UidValidity = 1, MessageId = "current@test.local", InternalDate = boundary });
            await db.SaveChangesAsync(Ct);
        }
        var activity = Assert.Single((await Read(admin.Client, "/api/companies/activity?weeks=2")).EnumerateArray());
        Assert.Equal(company.Id, activity.GetProperty("id").GetGuid());
        Assert.Equal(1, activity.GetProperty("projectCount").GetInt32());
        Assert.Equal(1, activity.GetProperty("boardsBooked").GetInt32());
        Assert.Equal(1, activity.GetProperty("threadCount").GetInt32());
        Assert.Equal("WaitingOnUs", activity.GetProperty("status").GetString());
        var weeks = activity.GetProperty("weeks").EnumerateArray().ToArray();
        Assert.Equal(monday.AddDays(-7).ToString("yyyy-MM-dd"), weeks[0].GetProperty("startDate").GetString());
        Assert.Equal(new[] { 1, 1 }, weeks.Select(w => w.GetProperty("conversations").GetInt32()));
    }

    [Fact]
    public async Task Empty_client_has_zero_activity_null_contact_and_null_reply_median()
    {
        var admin = await ApiFixture.RegisterAdminAsync(_factory);
        var (company, _) = await Client(admin.UserId);
        var activity = Assert.Single((await Read(admin.Client, "/api/companies/activity")).EnumerateArray());
        Assert.Equal("AllReplied", activity.GetProperty("status").GetString());
        Assert.Equal(0, activity.GetProperty("waitingCount").GetInt32());
        Assert.Equal(0, activity.GetProperty("threadCount").GetInt32());
        Assert.Equal(8, activity.GetProperty("weeks").GetArrayLength());
        Assert.All(activity.GetProperty("weeks").EnumerateArray(), w => Assert.Equal(0, w.GetProperty("conversations").GetInt32()));
        var insights = await Read(admin.Client, $"/api/companies/{company.Id}/insights");
        Assert.Equal(0, insights.GetProperty("boardsBooked").GetInt32());
        Assert.Equal(JsonValueKind.Null, insights.GetProperty("lastContactAt").ValueKind);
        Assert.Equal(JsonValueKind.Null, insights.GetProperty("firstReply").GetProperty("medianSeconds").ValueKind);
        Assert.Equal(0, insights.GetProperty("firstReply").GetProperty("count").GetInt32());
        Assert.Empty(insights.GetProperty("recentThreads").EnumerateArray());
    }

    [Fact]
    public async Task Insights_counts_overlapping_flights_and_reuses_accepted_reply_samples()
    {
        var admin = await ApiFixture.RegisterAdminAsync(_factory);
        var (company, project) = await Client(admin.UserId);
        var (connection, thread, _) = await ApiFixture.SeedThreadAsync(_factory, admin.UserId);
        var lastContact = DateTimeOffset.UtcNow.AddMinutes(-5);
        await using (var db = _factory.NewDbContext())
        {
            db.ThreadProjects.Add(new ThreadProject { ProjectId = project.Id, ThreadId = thread });
            db.ThreadCompanies.Add(new ThreadCompany { CompanyId = company.Id, ThreadId = thread });
            var t = (await db.MailThreads.FindAsync([thread], Ct))!;
            t.ReplyState = ReplyState.Awaiting;
            t.LastDate = lastContact;
            foreach (var (start, end) in new[] { ("2026-09-15", "2026-10-01"), ("2026-10-31", "2026-11-15"), ("2026-11-01", "2026-11-02") })
                db.ProjectFlights.Add(new ProjectFlight { ProjectId = project.Id, SiteName = "Site", StartDate = DateOnly.Parse(start), EndDate = DateOnly.Parse(end) });
            foreach (var (seconds, sent) in new[] { (60d, DateTimeOffset.UtcNow.AddDays(-1)), (180d, DateTimeOffset.UtcNow.AddDays(-2)), (900d, DateTimeOffset.UtcNow.AddDays(-31)), (1000d, DateTimeOffset.UtcNow.AddDays(1)) })
            {
                var key = Guid.NewGuid().ToString();
                var operation = new SendOperation { MailboxConnectionId = connection, CallerUserId = admin.UserId,
                    RequestKey = key, PayloadHash = "fixture", WireMessageId = key, Status = SendOperationStatus.Accepted };
                db.ThreadResponseTimes.Add(new ThreadResponseTime { SendOperation = operation, MailboxConnectionId = connection,
                    ThreadId = thread, CompanyId = company.Id, UserId = admin.UserId, InboundMessageKey = key,
                    SentAt = sent, ReceivedAt = sent.AddSeconds(-seconds), Seconds = seconds });
            }
            await db.SaveChangesAsync(Ct);
        }
        var insights = await Read(admin.Client, $"/api/companies/{company.Id}/insights?startDate=2026-10-01&endDate=2026-10-31");
        Assert.Equal(2, insights.GetProperty("boardsBooked").GetInt32());
        Assert.Equal(2, insights.GetProperty("firstReply").GetProperty("count").GetInt32());
        Assert.Equal(120, insights.GetProperty("firstReply").GetProperty("medianSeconds").GetDouble());
        Assert.InRange((insights.GetProperty("lastContactAt").GetDateTimeOffset() - lastContact).Duration().Ticks, 0, 10);
        Assert.Equal("Awaiting", Assert.Single(insights.GetProperty("recentThreads").EnumerateArray()).GetProperty("replyState").GetString());
        Assert.Equal(1, insights.GetProperty("threadCount").GetInt32());
        Assert.Equal(0, insights.GetProperty("waitingCount").GetInt32());
        var activity = Assert.Single((await Read(admin.Client, "/api/companies/activity")).EnumerateArray());
        Assert.Equal("AllReplied", activity.GetProperty("status").GetString());
    }

    [Fact]
    public async Task Both_endpoints_exclude_foreign_resources_even_with_cross_org_links()
    {
        var admin = await ApiFixture.RegisterAdminAsync(_factory);
        var (own, _) = await Client(admin.UserId);
        Guid foreignUser;
        await using (var db = _factory.NewDbContext())
        {
            var org = new Organization { Name = "Foreign" };
            var user = new User { Organization = org, Email = "foreign@test.local", Username = "foreign",
                DisplayName = "Foreign", PasswordHash = "fixture", Role = UserRole.Admin };
            db.Users.Add(user);
            await db.SaveChangesAsync(Ct);
            foreignUser = user.Id;
        }
        var (foreign, foreignProject) = await Client(foreignUser, "Foreign client");
        var (connection, thread, _) = await ApiFixture.SeedThreadAsync(_factory, foreignUser);
        await using (var db = _factory.NewDbContext())
        {
            db.ThreadCompanies.Add(new ThreadCompany { CompanyId = own.Id, ThreadId = thread });
            var key = Guid.NewGuid().ToString();
            var operation = new SendOperation { MailboxConnectionId = connection, CallerUserId = foreignUser,
                RequestKey = key, PayloadHash = "fixture", WireMessageId = key, Status = SendOperationStatus.Accepted };
            db.ThreadResponseTimes.Add(new ThreadResponseTime { SendOperation = operation, MailboxConnectionId = connection,
                ThreadId = thread, CompanyId = own.Id, UserId = foreignUser, InboundMessageKey = key,
                SentAt = DateTimeOffset.UtcNow.AddMinutes(-1), ReceivedAt = DateTimeOffset.UtcNow.AddMinutes(-2), Seconds = 60 });
            db.ProjectFlights.Add(new ProjectFlight { ProjectId = foreignProject.Id, SiteName = "Foreign site",
                StartDate = SignalMetrics.BusinessDate(DateTimeOffset.UtcNow), EndDate = SignalMetrics.BusinessDate(DateTimeOffset.UtcNow) });
            await db.SaveChangesAsync(Ct);
        }
        var activity = Assert.Single((await Read(admin.Client, "/api/companies/activity")).EnumerateArray());
        Assert.Equal(own.Id, activity.GetProperty("id").GetGuid());
        Assert.Equal(0, activity.GetProperty("threadCount").GetInt32());
        Assert.All(activity.GetProperty("weeks").EnumerateArray(), w => Assert.Equal(0, w.GetProperty("conversations").GetInt32()));
        var insights = await Read(admin.Client, $"/api/companies/{own.Id}/insights");
        Assert.Empty(insights.GetProperty("recentThreads").EnumerateArray());
        Assert.Equal(0, insights.GetProperty("boardsBooked").GetInt32());
        Assert.Equal(0, insights.GetProperty("firstReply").GetProperty("count").GetInt32());
        Assert.Equal(HttpStatusCode.NotFound, (await admin.Client.GetAsync($"/api/companies/{foreign.Id}/insights", Ct)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await admin.Client.GetAsync($"/api/companies/{Guid.NewGuid()}/insights", Ct)).StatusCode);
    }

    [Theory]
    [InlineData("0")]
    [InlineData("53")]
    [InlineData("invalid")]
    public async Task Activity_rejects_invalid_windows(string weeks)
    {
        var admin = await ApiFixture.RegisterAdminAsync(_factory);
        Assert.Equal(HttpStatusCode.BadRequest, (await admin.Client.GetAsync($"/api/companies/activity?weeks={weeks}", Ct)).StatusCode);
    }

    [Fact]
    public async Task Insights_rejects_reversed_excessive_and_malformed_windows_and_both_routes_require_authentication()
    {
        var admin = await ApiFixture.RegisterAdminAsync(_factory);
        var (company, _) = await Client(admin.UserId);
        var url = $"/api/companies/{company.Id}/insights";
        foreach (var query in new[] { "startDate=2026-10-02&endDate=2026-10-01", "startDate=2026-01-01&endDate=2028-01-01", "startDate=invalid" })
            Assert.Equal(HttpStatusCode.BadRequest, (await admin.Client.GetAsync($"{url}?{query}", Ct)).StatusCode);
        using var anonymous = _factory.CreateClient();
        Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.GetAsync(url, Ct)).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.GetAsync("/api/companies/activity", Ct)).StatusCode);
    }
}
