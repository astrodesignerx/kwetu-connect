using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Kompanion.Api.Data;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace Kompanion.Api.Tests;

public sealed class PasswordResetRequestTests : IAsyncLifetime
{
    private readonly TestAppFactory _factory = new();
    public ValueTask InitializeAsync() => _factory.InitializeAsync();
    public ValueTask DisposeAsync() => _factory.DisposeAsync();
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    private async Task Ask(string identifier)
    {
        using var client = _factory.CreateClient();
        var response = await client.PostAsJsonAsync("/api/auth/password-reset-requests", new { identifier }, Ct);
        Assert.Equal(HttpStatusCode.Accepted, response.StatusCode);
    }

    [Fact]
    public async Task Anonymous_requests_are_indistinguishable_and_duplicates_are_atomic()
    {
        var admin = await ApiFixture.RegisterAdminAsync(_factory);
        using var client = _factory.CreateClient();
        var real = await client.PostAsJsonAsync("/api/auth/password-reset-requests", new { identifier = admin.Email }, Ct);
        var unknown = await client.PostAsJsonAsync("/api/auth/password-reset-requests", new { identifier = "unknown@test.local" }, Ct);
        Assert.Equal(HttpStatusCode.Accepted, real.StatusCode);
        Assert.Equal(real.StatusCode, unknown.StatusCode);
        Assert.Equal(await real.Content.ReadAsStringAsync(Ct), await unknown.Content.ReadAsStringAsync(Ct));
        await Task.WhenAll(Ask(" @testadmin "), Ask(admin.Email));
        await using var db = _factory.NewDbContext();
        var request = Assert.Single(await db.PasswordResetRequests.ToListAsync(Ct));
        Assert.Equal(admin.UserId, request.UserId);
        Assert.Null(request.ResolvedAt);
        Assert.Single(await db.AuditLogEntries.Where(a => a.Action == "auth.password_reset.request").ToListAsync(Ct));
    }

    [Fact]
    public async Task Admin_reset_returns_a_working_password_revokes_all_tokens_and_resolves_the_request()
    {
        var admin = await ApiFixture.RegisterAdminAsync(_factory);
        var member = await ApiFixture.InviteAndRegisterAsync(_factory, admin, "member@test.local");
        var secondSession = await ApiFixture.LoginAsync(_factory, member.Email, "another good password");
        await Ask(member.Email);
        var list = await admin.Client.GetFromJsonAsync<JsonElement[]>("/api/admin/password-reset-requests", Ct);
        var listed = Assert.Single(list!);
        Assert.Equal(member.UserId, listed.GetProperty("userId").GetGuid());
        Assert.Equal(member.Email, listed.GetProperty("email").GetString());
        Assert.Equal("member", listed.GetProperty("displayName").GetString());
        Assert.True(listed.GetProperty("createdAt").GetDateTimeOffset() <= DateTimeOffset.UtcNow);
        var response = await admin.Client.PostAsync($"/api/admin/users/{member.UserId}/reset-password", null, Ct);
        response.EnsureSuccessStatusCode();
        Assert.True(response.Headers.CacheControl!.NoStore);
        var password = (await response.Content.ReadFromJsonAsync<JsonElement>(Ct)).GetProperty("newPassword").GetString()!;
        Assert.False(string.IsNullOrWhiteSpace(password));
        await ApiFixture.LoginAsync(_factory, member.Email, password);
        using var anonymous = _factory.CreateClient();
        Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.PostAsJsonAsync("/api/auth/login",
            new { identifier = member.Email, password = "another good password" }, Ct)).StatusCode);
        foreach (var session in new[] { member, secondSession })
            Assert.Equal(HttpStatusCode.Unauthorized, (await session.Client.GetAsync("/api/auth/me", Ct)).StatusCode);
        await using var db = _factory.NewDbContext();
        var request = await db.PasswordResetRequests.SingleAsync(Ct);
        Assert.NotNull(request.ResolvedAt);
        Assert.Equal(admin.UserId, request.ResolvedByUserId);
        Assert.True(await db.AuditLogEntries.AnyAsync(a => a.Action == "admin.user.password_reset" && a.TargetUserId == member.UserId, Ct));
        Assert.DoesNotContain(password, JsonSerializer.Serialize(await db.AuditLogEntries.ToListAsync(Ct)));
        Assert.Empty((await admin.Client.GetFromJsonAsync<JsonElement[]>("/api/admin/password-reset-requests", Ct))!);
        var overview = await admin.Client.GetFromJsonAsync<JsonElement>("/api/workspace/overview", Ct);
        Assert.Equal(0, overview.GetProperty("pendingPasswordResets").GetInt32());
        // Resetting a person who did not ask remains available.
        (await admin.Client.PostAsync($"/api/admin/users/{member.UserId}/reset-password", null, Ct)).EnsureSuccessStatusCode();
    }

    [Fact]
    public async Task Members_cannot_list_reset_or_dismiss_and_anonymous_users_cannot_either()
    {
        var admin = await ApiFixture.RegisterAdminAsync(_factory);
        var member = await ApiFixture.InviteAndRegisterAsync(_factory, admin, "member@test.local");
        await Ask(member.Email);
        await using var db = _factory.NewDbContext();
        var id = (await db.PasswordResetRequests.SingleAsync(Ct)).Id;
        using var anonymous = _factory.CreateClient();
        foreach (var (client, expected) in new[] { (member.Client, HttpStatusCode.Forbidden), (anonymous, HttpStatusCode.Unauthorized) })
        {
            Assert.Equal(expected, (await client.GetAsync("/api/admin/password-reset-requests", Ct)).StatusCode);
            Assert.Equal(expected, (await client.PostAsync($"/api/admin/users/{admin.UserId}/reset-password", null, Ct)).StatusCode);
            Assert.Equal(expected, (await client.DeleteAsync($"/api/admin/password-reset-requests/{id}", Ct)).StatusCode);
        }
    }

    [Fact]
    public async Task Admin_cannot_reset_themselves_or_access_foreign_people_and_requests()
    {
        var admin = await ApiFixture.RegisterAdminAsync(_factory);
        await using var db = _factory.NewDbContext();
        var foreign = new User { Organization = new Organization { Name = "Other" }, Email = "other@test.local",
            Username = "other", DisplayName = "Other", PasswordHash = "untouched" };
        db.Users.Add(foreign);
        db.PasswordResetRequests.Add(new PasswordResetRequest { User = foreign });
        await db.SaveChangesAsync(Ct);
        var request = await db.PasswordResetRequests.SingleAsync(Ct);
        Assert.Equal(HttpStatusCode.BadRequest, (await admin.Client.PostAsync($"/api/admin/users/{admin.UserId}/reset-password", null, Ct)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await admin.Client.PostAsync($"/api/admin/users/{foreign.Id}/reset-password", null, Ct)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await admin.Client.DeleteAsync($"/api/admin/password-reset-requests/{request.Id}", Ct)).StatusCode);
        Assert.Empty((await admin.Client.GetFromJsonAsync<JsonElement[]>("/api/admin/password-reset-requests", Ct))!);
        Assert.Equal("untouched", (await db.Users.AsNoTracking().SingleAsync(u => u.Id == foreign.Id, Ct)).PasswordHash);
    }

    [Fact]
    public async Task Dismissal_resolves_without_changing_password_and_allows_a_fresh_request()
    {
        var admin = await ApiFixture.RegisterAdminAsync(_factory);
        var member = await ApiFixture.InviteAndRegisterAsync(_factory, admin, "member@test.local");
        await Ask(member.Email);
        await using var db = _factory.NewDbContext();
        var request = await db.PasswordResetRequests.SingleAsync(Ct);
        var overview = await admin.Client.GetFromJsonAsync<JsonElement>("/api/workspace/overview", Ct);
        Assert.Equal(1, overview.GetProperty("pendingPasswordResets").GetInt32());
        Assert.Equal(HttpStatusCode.NoContent, (await admin.Client.DeleteAsync($"/api/admin/password-reset-requests/{request.Id}", Ct)).StatusCode);
        await ApiFixture.LoginAsync(_factory, member.Email, "another good password");
        Assert.Equal(HttpStatusCode.OK, (await member.Client.GetAsync("/api/auth/me", Ct)).StatusCode);
        await db.Entry(request).ReloadAsync(Ct);
        Assert.NotNull(request.ResolvedAt);
        Assert.Equal(admin.UserId, request.ResolvedByUserId);
        Assert.True(await db.AuditLogEntries.AnyAsync(a => a.Action == "admin.password_reset.dismiss", Ct));
        await Ask(member.Email);
        Assert.Equal(2, await db.PasswordResetRequests.CountAsync(Ct));
        Assert.Equal(1, await db.PasswordResetRequests.CountAsync(r => r.ResolvedAt == null, Ct));
    }
}
