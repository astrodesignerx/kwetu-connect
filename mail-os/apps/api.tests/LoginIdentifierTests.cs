using System.Net;
using System.Net.Http.Json;
using Kompanion.Api.Auth;
using Kompanion.Api.Data;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace Kompanion.Api.Tests;

/// <summary>
/// Sign-in accepts an email address or a username handle. The handle is a dedicated
/// field, not the display name — display names went back to being free text once they
/// stopped being credentials.
/// </summary>
public class LoginIdentifierTests : IAsyncLifetime
{
    private TestAppFactory _factory = null!;

    public async ValueTask InitializeAsync()
    {
        _factory = new TestAppFactory();
        await _factory.InitializeAsync();
    }

    public async ValueTask DisposeAsync() => await _factory.DisposeAsync();

    private Task<HttpResponseMessage> LoginAsync(string identifier, string password) =>
        _factory.CreateClient().PostAsJsonAsync("/api/auth/login", new { identifier, password });

    private async Task<string> UsernameOfAsync(Guid userId)
    {
        await using var db = _factory.NewDbContext();
        return (await db.Users.SingleAsync(u => u.Id == userId)).Username;
    }

    [Fact]
    public async Task Registration_derives_a_handle_from_the_display_name()
    {
        // RegisterAdminAsync uses the display name "Test Admin".
        var admin = await ApiFixture.RegisterAdminAsync(_factory);

        Assert.Equal("testadmin", await UsernameOfAsync(admin.UserId));
    }

    [Fact]
    public async Task Can_sign_in_with_the_email_address()
    {
        await ApiFixture.RegisterAdminAsync(_factory, "admin@test.local", "a good password");
        (await LoginAsync("admin@test.local", "a good password")).EnsureSuccessStatusCode();
    }

    [Fact]
    public async Task Can_sign_in_with_the_username()
    {
        await ApiFixture.RegisterAdminAsync(_factory, "admin@test.local", "a good password");
        (await LoginAsync("testadmin", "a good password")).EnsureSuccessStatusCode();
    }

    [Theory]
    [InlineData("TESTADMIN")]
    [InlineData("  testadmin  ")]
    [InlineData("@testadmin")]          // pasted in the form it is displayed
    [InlineData("  @TestAdmin ")]
    [InlineData("ADMIN@TEST.LOCAL")]
    public async Task Identifier_is_normalised_before_matching(string identifier)
    {
        await ApiFixture.RegisterAdminAsync(_factory, "admin@test.local", "a good password");
        (await LoginAsync(identifier, "a good password")).EnsureSuccessStatusCode();
    }

    [Fact]
    public async Task Display_name_is_no_longer_a_login_identifier()
    {
        await ApiFixture.RegisterAdminAsync(_factory, "admin@test.local", "a good password");

        // "Test Admin" is the display name; the handle is "testadmin".
        Assert.Equal(HttpStatusCode.Unauthorized,
            (await LoginAsync("Test Admin", "a good password")).StatusCode);
    }

    [Fact]
    public async Task Wrong_password_is_rejected_for_both_identifier_forms()
    {
        await ApiFixture.RegisterAdminAsync(_factory, "admin@test.local", "a good password");

        Assert.Equal(HttpStatusCode.Unauthorized, (await LoginAsync("admin@test.local", "nope")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await LoginAsync("testadmin", "nope")).StatusCode);
    }

    [Fact]
    public async Task Unknown_identifier_is_rejected()
    {
        await ApiFixture.RegisterAdminAsync(_factory);

        Assert.Equal(HttpStatusCode.Unauthorized, (await LoginAsync("nobody", "a good password")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await LoginAsync("", "a good password")).StatusCode);
    }

    [Fact]
    public async Task Colliding_handles_are_disambiguated_with_a_suffix()
    {
        var admin = await ApiFixture.RegisterAdminAsync(_factory, "admin@test.local");
        var token = await ApiFixture.CreateInviteTokenAsync(admin, "twin@test.local");

        var res = await _factory.CreateClient().PostAsJsonAsync("/api/auth/register", new
        {
            email = "twin@test.local",
            password = "password12345",
            displayName = "Test Admin", // same display name as the admin
            inviteToken = token,
        });
        res.EnsureSuccessStatusCode();

        await using var db = _factory.NewDbContext();
        var twin = await db.Users.SingleAsync(u => u.Email == "twin@test.local");
        Assert.Equal("testadmin2", twin.Username);

        // Duplicate display names are fine now; the handles are what must differ.
        Assert.Equal("Test Admin", twin.DisplayName);
    }

    [Fact]
    public async Task A_caller_supplied_handle_is_honoured()
    {
        var admin = await ApiFixture.RegisterAdminAsync(_factory);
        var token = await ApiFixture.CreateInviteTokenAsync(admin, "jane@test.local");

        var res = await _factory.CreateClient().PostAsJsonAsync("/api/auth/register", new
        {
            email = "jane@test.local",
            password = "password12345",
            displayName = "Jane Wanjiru",
            inviteToken = token,
            username = "  @Jane.W  ", // normalised on the way in
        });
        res.EnsureSuccessStatusCode();

        await using var db = _factory.NewDbContext();
        Assert.Equal("jane.w", (await db.Users.SingleAsync(u => u.Email == "jane@test.local")).Username);
    }

    [Fact]
    public async Task A_taken_handle_is_rejected_at_registration()
    {
        var admin = await ApiFixture.RegisterAdminAsync(_factory);
        var token = await ApiFixture.CreateInviteTokenAsync(admin, "clash@test.local");

        var res = await _factory.CreateClient().PostAsJsonAsync("/api/auth/register", new
        {
            email = "clash@test.local",
            password = "password12345",
            displayName = "Someone Else",
            inviteToken = token,
            username = "TESTADMIN", // same handle as the admin, different case
        });

        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
    }

    [Theory]
    [InlineData("ab")]              // too short
    [InlineData("has space")]
    [InlineData("has@at")]
    [InlineData(".leading")]
    [InlineData("trailing-")]
    public async Task Malformed_handles_are_rejected(string username)
    {
        var admin = await ApiFixture.RegisterAdminAsync(_factory);
        var token = await ApiFixture.CreateInviteTokenAsync(admin, "bad@test.local");

        var res = await _factory.CreateClient().PostAsJsonAsync("/api/auth/register", new
        {
            email = "bad@test.local",
            password = "password12345",
            displayName = "Bad Handle",
            inviteToken = token,
            username,
        });

        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
    }

    [Fact]
    public async Task Changing_the_handle_changes_what_you_sign_in_with()
    {
        var admin = await ApiFixture.RegisterAdminAsync(_factory, "admin@test.local", "a good password");

        (await admin.Client.PatchAsJsonAsync("/api/auth/me",
            new { username = "kwetuadmin" })).EnsureSuccessStatusCode();

        (await LoginAsync("kwetuadmin", "a good password")).EnsureSuccessStatusCode();
        Assert.Equal(HttpStatusCode.Unauthorized, (await LoginAsync("testadmin", "a good password")).StatusCode);
        // The email address keeps working regardless.
        (await LoginAsync("admin@test.local", "a good password")).EnsureSuccessStatusCode();
    }

    [Fact]
    public async Task Renaming_to_a_taken_handle_is_rejected()
    {
        var admin = await ApiFixture.RegisterAdminAsync(_factory);
        var member = await ApiFixture.InviteAndRegisterAsync(_factory, admin, "member@test.local");

        var res = await member.Client.PatchAsJsonAsync("/api/auth/me", new { username = "testadmin" });
        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
    }

    [Fact]
    public async Task Display_names_may_now_be_duplicated()
    {
        var admin = await ApiFixture.RegisterAdminAsync(_factory);

        var res = await admin.Client.PatchAsJsonAsync("/api/auth/me", new { displayName = "Test Admin" });
        res.EnsureSuccessStatusCode();

        var member = await ApiFixture.InviteAndRegisterAsync(_factory, admin, "member@test.local");
        var rename = await member.Client.PatchAsJsonAsync("/api/auth/me",
            new { displayName = "Test Admin" });

        rename.EnsureSuccessStatusCode();
    }

    [Fact]
    public async Task The_unique_index_holds_when_validation_is_bypassed()
    {
        var admin = await ApiFixture.RegisterAdminAsync(_factory);

        await using var db = _factory.NewDbContext();
        var orgId = (await db.Users.SingleAsync(u => u.Id == admin.UserId)).OrganizationId;

        db.Users.Add(new User
        {
            OrganizationId = orgId,
            Email = "bypass@test.local",
            Username = "testadmin", // already taken
            DisplayName = "Bypass",
            PasswordHash = "x",
        });

        await Assert.ThrowsAnyAsync<DbUpdateException>(() => db.SaveChangesAsync());
    }

    [Theory]
    [InlineData("Kwetu Admin", "kwetuadmin")]
    [InlineData("Jane Wanjiru", "janewanjiru")]
    [InlineData("Zoë  Müller", "zoemuller")]   // accents folded, not dropped as unknown
    [InlineData("@weird..name!", "weird..name")]
    [InlineData("!!!", "")]                     // nothing usable survives
    public void Suggest_turns_a_display_name_into_a_handle(string input, string expected)
    {
        Assert.Equal(expected, Usernames.Suggest(input));
    }
}
