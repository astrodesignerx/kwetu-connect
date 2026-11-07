using System.Net;
using System.Net.Http.Json;
using Kompanion.Api.Controllers;
using Kompanion.Api.Data;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace Kompanion.Api.Tests;

public sealed class MailInsightsTests : IAsyncLifetime
{
    private readonly TestAppFactory _factory = new();
    public ValueTask InitializeAsync() => _factory.InitializeAsync();
    public ValueTask DisposeAsync() => _factory.DisposeAsync();

    [Fact]
    public async Task Members_can_resolve_shared_thread_mailbox_and_client_but_not_foreign_threads()
    {
        var ct = TestContext.Current.CancellationToken;
        var admin = await ApiFixture.RegisterAdminAsync(_factory);
        var member = await ApiFixture.InviteAndRegisterAsync(_factory, admin, "reader@test.local");
        var (connection, thread, _) = await ApiFixture.SeedThreadAsync(_factory, admin.UserId);
        Guid foreignOwner;
        Guid clientId;
        await using (var db = _factory.NewDbContext())
        {
            var orgId = await db.Users.Where(user => user.Id == admin.UserId).Select(user => user.OrganizationId).SingleAsync(ct);
            var company = new Company { OrganizationId = orgId, Name = "Actual client" };
            db.ThreadCompanies.Add(new ThreadCompany { ThreadId = thread, Company = company });
            var outsider = new User
            {
                Organization = new Organization { Name = "Other organisation" }, Email = "foreign@test.local",
                Username = "foreign", DisplayName = "Foreign", PasswordHash = "unused", Role = UserRole.Member
            };
            db.Users.Add(outsider);
            await db.SaveChangesAsync(ct);
            foreignOwner = outsider.Id;
            clientId = company.Id;
        }
        var (_, foreignThread, _) = await ApiFixture.SeedThreadAsync(_factory, foreignOwner);
        var result = await member.Client.GetFromJsonAsync<List<MailInsightsController.MailInsight>>(
            $"/api/mail/insights?ids={thread}&ids={foreignThread}&ids={Guid.NewGuid()}", ct);
        var insight = Assert.Single(result!);
        Assert.Equal(thread, insight.Id);
        Assert.Equal(connection, insight.MailboxConnectionId);
        Assert.Equal(clientId, insight.ClientId);
        Assert.Equal("Actual client", insight.ClientName);
    }

    [Fact]
    public async Task Lookup_requires_auth_limits_batch_and_preserves_unlinked_threads()
    {
        var ct = TestContext.Current.CancellationToken;
        Assert.Equal(HttpStatusCode.Unauthorized, (await _factory.CreateClient().GetAsync("/api/mail/insights", ct)).StatusCode);
        var admin = await ApiFixture.RegisterAdminAsync(_factory);
        var (connection, thread, _) = await ApiFixture.SeedThreadAsync(_factory, admin.UserId);
        var rows = await admin.Client.GetFromJsonAsync<List<MailInsightsController.MailInsight>>($"/api/mail/insights?ids={thread}&ids={thread}", ct);
        var row = Assert.Single(rows!);
        Assert.Equal(connection, row.MailboxConnectionId);
        Assert.Null(row.ClientId);
        Assert.Null(row.ClientName);
        var empty = await admin.Client.GetFromJsonAsync<List<MailInsightsController.MailInsight>>("/api/mail/insights", ct);
        Assert.Empty(empty!);
        var query = string.Join("&", Enumerable.Range(0, 201).Select(_ => $"ids={Guid.NewGuid():N}"));
        Assert.Equal(HttpStatusCode.BadRequest, (await admin.Client.GetAsync($"/api/mail/insights?{query}", ct)).StatusCode);
    }
}
