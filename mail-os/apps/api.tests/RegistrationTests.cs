using System.Net;
using System.Net.Http.Json;
using Kompanion.Api.Data;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace Kompanion.Api.Tests;

/// <summary>
/// Registration used to be open to anyone who could reach the API, which — given the
/// shared inbox — meant self-service access to every mailbox in the org.
/// </summary>
public class RegistrationTests : IAsyncLifetime
{
    private TestAppFactory _factory = null!;

    public async ValueTask InitializeAsync()
    {
        _factory = new TestAppFactory();
        await _factory.InitializeAsync();
    }

    public async ValueTask DisposeAsync() => await _factory.DisposeAsync();

    [Fact]
    public async Task First_account_needs_no_invite_and_becomes_admin()
    {
        var client = _factory.CreateClient();

        var mode = await client.GetFromJsonAsync<ModeBody>("/api/auth/registration-mode");
        Assert.Equal("bootstrap", mode!.Mode);

        var admin = await ApiFixture.RegisterAdminAsync(_factory);

        await using var db = _factory.NewDbContext();
        var user = await db.Users.SingleAsync(u => u.Id == admin.UserId);
        Assert.Equal(UserRole.Admin, user.Role);
    }

    [Fact]
    public async Task Second_account_without_an_invite_is_rejected()
    {
        await ApiFixture.RegisterAdminAsync(_factory);

        var client = _factory.CreateClient();
        var mode = await client.GetFromJsonAsync<ModeBody>("/api/auth/registration-mode");
        Assert.Equal("invite", mode!.Mode);

        var res = await client.PostAsJsonAsync("/api/auth/register", new
        {
            email = "intruder@test.local",
            password = "password12345",
            displayName = "Intruder"
        });

        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
        await using var db = _factory.NewDbContext();
        Assert.False(await db.Users.AnyAsync(u => u.Email == "intruder@test.local"));
    }

    [Fact]
    public async Task Invited_account_is_created_with_the_invited_role()
    {
        var admin = await ApiFixture.RegisterAdminAsync(_factory);

        var member = await ApiFixture.InviteAndRegisterAsync(_factory, admin, "member@test.local");

        await using var db = _factory.NewDbContext();
        var user = await db.Users.SingleAsync(u => u.Id == member.UserId);
        Assert.Equal(UserRole.Member, user.Role);
    }

    [Fact]
    public async Task Invite_cannot_be_redeemed_by_a_different_email()
    {
        var admin = await ApiFixture.RegisterAdminAsync(_factory);
        var token = await ApiFixture.CreateInviteTokenAsync(admin, "expected@test.local");

        var client = _factory.CreateClient();
        var res = await client.PostAsJsonAsync("/api/auth/register", new
        {
            email = "someone.else@test.local",
            password = "password12345",
            displayName = "Someone Else",
            inviteToken = token
        });

        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
    }

    [Fact]
    public async Task Invite_cannot_be_used_twice()
    {
        var admin = await ApiFixture.RegisterAdminAsync(_factory);
        var token = await ApiFixture.CreateInviteTokenAsync(admin, "once@test.local");

        var first = await _factory.CreateClient().PostAsJsonAsync("/api/auth/register", new
        {
            email = "once@test.local",
            password = "password12345",
            displayName = "Once",
            inviteToken = token
        });
        first.EnsureSuccessStatusCode();

        // Same token, and the address is now taken — either way it must not succeed.
        var second = await _factory.CreateClient().PostAsJsonAsync("/api/auth/register", new
        {
            email = "once@test.local",
            password = "password12345",
            displayName = "Once Again",
            inviteToken = token
        });
        Assert.False(second.IsSuccessStatusCode);
    }

    [Fact]
    public async Task Revoked_invite_is_rejected()
    {
        var admin = await ApiFixture.RegisterAdminAsync(_factory);
        var token = await ApiFixture.CreateInviteTokenAsync(admin, "revoked@test.local");

        var list = await admin.Client.GetFromJsonAsync<List<InvitationBody>>("/api/admin/invitations");
        var pending = list!.Single(i => i.Email == "revoked@test.local");
        (await admin.Client.DeleteAsync($"/api/admin/invitations/{pending.Id}")).EnsureSuccessStatusCode();

        var res = await _factory.CreateClient().PostAsJsonAsync("/api/auth/register", new
        {
            email = "revoked@test.local",
            password = "password12345",
            displayName = "Revoked",
            inviteToken = token
        });
        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
    }

    [Fact]
    public async Task Issuing_a_new_invite_supersedes_the_previous_one()
    {
        var admin = await ApiFixture.RegisterAdminAsync(_factory);
        var stale = await ApiFixture.CreateInviteTokenAsync(admin, "reissued@test.local");
        var current = await ApiFixture.CreateInviteTokenAsync(admin, "reissued@test.local");

        Assert.NotEqual(stale, current);

        var withStale = await _factory.CreateClient().PostAsJsonAsync("/api/auth/register", new
        {
            email = "reissued@test.local",
            password = "password12345",
            displayName = "Reissued",
            inviteToken = stale
        });
        Assert.Equal(HttpStatusCode.BadRequest, withStale.StatusCode);

        var withCurrent = await _factory.CreateClient().PostAsJsonAsync("/api/auth/register", new
        {
            email = "reissued@test.local",
            password = "password12345",
            displayName = "Reissued",
            inviteToken = current
        });
        withCurrent.EnsureSuccessStatusCode();
    }

    [Fact]
    public async Task Only_the_token_hash_is_stored()
    {
        var admin = await ApiFixture.RegisterAdminAsync(_factory);
        var token = await ApiFixture.CreateInviteTokenAsync(admin, "hashed@test.local");

        await using var db = _factory.NewDbContext();
        var stored = await db.Invitations.SingleAsync(i => i.Email == "hashed@test.local");

        Assert.NotEqual(token, stored.TokenHash);
        Assert.Equal(64, stored.TokenHash.Length);
    }

    [Fact]
    public async Task Members_cannot_issue_invitations()
    {
        var admin = await ApiFixture.RegisterAdminAsync(_factory);
        var member = await ApiFixture.InviteAndRegisterAsync(_factory, admin, "member@test.local");

        var res = await member.Client.PostAsJsonAsync("/api/admin/invitations",
            new { email = "friend@test.local", role = "Admin" });

        Assert.Equal(HttpStatusCode.Forbidden, res.StatusCode);
    }

    private record ModeBody(string Mode);
    private record InvitationBody(Guid Id, string Email, string Role, string Status);
}
