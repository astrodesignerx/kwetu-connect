using System.Net;
using System.Net.Http.Json;
using Kompanion.Api.Data;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace Kompanion.Api.Tests;

/// <summary>
/// Tokens are valid for 7 days. Without a version check, one stolen before a password
/// reset stays usable for the full week after it.
/// </summary>
public class TokenRevocationTests : IAsyncLifetime
{
    private TestAppFactory _factory = null!;

    public async ValueTask InitializeAsync()
    {
        _factory = new TestAppFactory();
        await _factory.InitializeAsync();
    }

    public async ValueTask DisposeAsync() => await _factory.DisposeAsync();

    [Fact]
    public async Task Changing_the_password_invalidates_existing_tokens()
    {
        var admin = await ApiFixture.RegisterAdminAsync(_factory, password: "original password");

        // A second device, holding a token minted before the change.
        var otherDevice = ApiFixture.ClientWithToken(_factory, admin.Token);
        (await otherDevice.GetAsync("/api/auth/me")).EnsureSuccessStatusCode();

        var change = await admin.Client.PatchAsJsonAsync("/api/auth/me", new
        {
            currentPassword = "original password",
            newPassword = "a brand new password"
        });
        change.EnsureSuccessStatusCode();

        var stale = await otherDevice.GetAsync("/api/auth/me");
        Assert.Equal(HttpStatusCode.Unauthorized, stale.StatusCode);
    }

    [Fact]
    public async Task Changing_the_password_returns_a_working_replacement_token()
    {
        var admin = await ApiFixture.RegisterAdminAsync(_factory, password: "original password");

        var change = await admin.Client.PatchAsJsonAsync("/api/auth/me", new
        {
            currentPassword = "original password",
            newPassword = "a brand new password"
        });
        change.EnsureSuccessStatusCode();

        var body = await change.Content.ReadFromJsonAsync<UpdateProfileBody>();
        Assert.NotNull(body!.Token);

        var refreshed = ApiFixture.ClientWithToken(_factory, body.Token!);
        (await refreshed.GetAsync("/api/auth/me")).EnsureSuccessStatusCode();
    }

    [Fact]
    public async Task Renaming_without_a_password_change_keeps_the_session_and_issues_no_token()
    {
        var admin = await ApiFixture.RegisterAdminAsync(_factory);

        var change = await admin.Client.PatchAsJsonAsync("/api/auth/me", new { displayName = "Renamed" });
        change.EnsureSuccessStatusCode();

        var body = await change.Content.ReadFromJsonAsync<UpdateProfileBody>();
        Assert.Null(body!.Token);
        Assert.Equal("Renamed", body.User.DisplayName);

        (await admin.Client.GetAsync("/api/auth/me")).EnsureSuccessStatusCode();
    }

    [Fact]
    public async Task Login_after_a_password_change_works_with_the_new_password_only()
    {
        var admin = await ApiFixture.RegisterAdminAsync(_factory, password: "original password");
        (await admin.Client.PatchAsJsonAsync("/api/auth/me", new
        {
            currentPassword = "original password",
            newPassword = "a brand new password"
        })).EnsureSuccessStatusCode();

        var withOld = await _factory.CreateClient().PostAsJsonAsync("/api/auth/login",
            new { identifier = admin.Email, password = "original password" });
        Assert.Equal(HttpStatusCode.Unauthorized, withOld.StatusCode);

        var withNew = await ApiFixture.LoginAsync(_factory, admin.Email, "a brand new password");
        (await withNew.Client.GetAsync("/api/auth/me")).EnsureSuccessStatusCode();
    }

    [Fact]
    public async Task Bumping_the_version_directly_revokes_the_session()
    {
        var admin = await ApiFixture.RegisterAdminAsync(_factory);

        await using (var db = _factory.NewDbContext())
        {
            var user = await db.Users.SingleAsync(u => u.Id == admin.UserId);
            user.TokenVersion += 1;
            await db.SaveChangesAsync();
        }

        // The cache holds the old value briefly; wait past its TTL (1 second under
        // test, see TestAppFactory) so this asserts the revocation path, not a race.
        await Task.Delay(TimeSpan.FromSeconds(3));

        var res = await admin.Client.GetAsync("/api/auth/me");
        Assert.Equal(HttpStatusCode.Unauthorized, res.StatusCode);
    }

    /// <summary>
    /// The role travels as a JWT claim and [Authorize(Roles="Admin")] trusts it. Without
    /// a version bump on the role change, a demoted admin kept full admin powers for the
    /// remaining life of their token — up to 7 days.
    /// </summary>
    [Fact]
    public async Task Demoting_an_admin_revokes_their_existing_session()
    {
        var admin = await ApiFixture.RegisterAdminAsync(_factory);
        var promoted = await ApiFixture.InviteAndRegisterAsync(
            _factory, admin, "promoted@test.local", role: "Admin");

        // The account is signed in on its own device and can reach admin endpoints.
        (await promoted.Client.GetAsync("/api/admin/users")).EnsureSuccessStatusCode();

        var demote = await admin.Client.PatchAsJsonAsync(
            $"/api/admin/users/{promoted.UserId}/role", new { role = "Member" });
        demote.EnsureSuccessStatusCode();

        var stale = await promoted.Client.GetAsync("/api/admin/users");
        Assert.Equal(HttpStatusCode.Unauthorized, stale.StatusCode);
    }

    /// <summary>
    /// The flip side of the bump: setting the role it already has must not sign the user
    /// out of every device for nothing.
    /// </summary>
    [Fact]
    public async Task Re_applying_the_same_role_keeps_the_session()
    {
        var admin = await ApiFixture.RegisterAdminAsync(_factory);
        var member = await ApiFixture.InviteAndRegisterAsync(_factory, admin, "member@test.local");

        var same = await admin.Client.PatchAsJsonAsync(
            $"/api/admin/users/{member.UserId}/role", new { role = "Member" });
        same.EnsureSuccessStatusCode();

        (await member.Client.GetAsync("/api/auth/me")).EnsureSuccessStatusCode();
    }

    private record UpdateProfileBody(UserBody User, string? Token);
    private record UserBody(Guid Id, string Email, string DisplayName, string Role);
}
