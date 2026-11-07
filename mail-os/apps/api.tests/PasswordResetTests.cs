using System.Net;
using System.Net.Http.Json;
using Kompanion.Api.Data;
using Kompanion.Api.Services;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace Kompanion.Api.Tests;

/// <summary>
/// The out-of-band reset behind `dotnet run --project apps/api -- reset-password`.
/// Exercises the service rather than the console wrapper, so the assertions are about
/// behaviour rather than stdout formatting.
/// </summary>
public class PasswordResetTests : IAsyncLifetime
{
    private TestAppFactory _factory = null!;

    public async ValueTask InitializeAsync()
    {
        _factory = new TestAppFactory();
        await _factory.InitializeAsync();
    }

    public async ValueTask DisposeAsync() => await _factory.DisposeAsync();

    private async Task<PasswordResetService.Result> ResetAsync(string identifier)
    {
        using var scope = _factory.Services.CreateScope();
        var service = scope.ServiceProvider.GetRequiredService<PasswordResetService>();
        return await service.ResetAsync(identifier);
    }

    private Task<HttpResponseMessage> LoginAsync(string identifier, string password) =>
        _factory.CreateClient().PostAsJsonAsync("/api/auth/login", new { identifier, password });

    [Fact]
    public async Task Generated_passwords_are_long_and_never_repeat()
    {
        var generated = Enumerable.Range(0, 200)
            .Select(_ => PasswordResetService.GeneratePassword())
            .ToList();

        Assert.All(generated, p => Assert.Equal(23, p.Length)); // 4 groups of 5 + 3 hyphens
        Assert.All(generated, p => Assert.Equal(4, p.Split('-').Length));
        Assert.Equal(generated.Count, generated.Distinct().Count());
        // Look-alike characters are excluded so the value survives being read aloud.
        Assert.All(generated, p => Assert.DoesNotContain('0', p));
        Assert.All(generated, p => Assert.DoesNotContain('O', p));
        Assert.All(generated, p => Assert.DoesNotContain('l', p));
        Assert.All(generated, p => Assert.DoesNotContain('1', p));
    }

    [Fact]
    public async Task Reset_by_email_produces_a_working_password()
    {
        await ApiFixture.RegisterAdminAsync(_factory, "admin@test.local", "the old password");

        var result = await ResetAsync("admin@test.local");

        Assert.True(result.Found);
        Assert.Equal("admin@test.local", result.Email);
        Assert.Equal("Admin", result.Role);
        Assert.NotNull(result.NewPassword);

        (await LoginAsync("admin@test.local", result.NewPassword!)).EnsureSuccessStatusCode();
        Assert.Equal(HttpStatusCode.Unauthorized,
            (await LoginAsync("admin@test.local", "the old password")).StatusCode);
    }

    [Fact]
    public async Task Reset_by_username_resolves_the_same_account()
    {
        var admin = await ApiFixture.RegisterAdminAsync(_factory, "admin@test.local");

        // Handle derived from the display name "Test Admin", pasted with its "@".
        var result = await ResetAsync("@TestAdmin");

        Assert.True(result.Found);
        Assert.Equal("admin@test.local", result.Email);
        Assert.Equal("testadmin", result.Username);
        (await LoginAsync("testadmin", result.NewPassword!)).EnsureSuccessStatusCode();

        await using var db = _factory.NewDbContext();
        Assert.True(await db.Users.AnyAsync(u => u.Id == admin.UserId));
    }

    [Fact]
    public async Task Reset_signs_out_every_existing_session()
    {
        var admin = await ApiFixture.RegisterAdminAsync(_factory);
        (await admin.Client.GetAsync("/api/auth/me")).EnsureSuccessStatusCode();

        await ResetAsync(admin.Email);

        // A reset that left old tokens working would defeat its own purpose.
        var stale = await admin.Client.GetAsync("/api/auth/me");
        Assert.Equal(HttpStatusCode.Unauthorized, stale.StatusCode);
    }

    [Fact]
    public async Task Unknown_identifier_reports_not_found_and_changes_nothing()
    {
        var admin = await ApiFixture.RegisterAdminAsync(_factory, password: "unchanged password");

        var result = await ResetAsync("nobody@test.local");

        Assert.False(result.Found);
        Assert.Null(result.NewPassword);
        (await LoginAsync(admin.Email, "unchanged password")).EnsureSuccessStatusCode();
    }

    [Fact]
    public async Task Blank_identifier_is_not_found()
    {
        await ApiFixture.RegisterAdminAsync(_factory);

        Assert.False((await ResetAsync("")).Found);
        Assert.False((await ResetAsync("   ")).Found);
    }

    [Fact]
    public async Task Reset_does_not_touch_other_accounts()
    {
        var admin = await ApiFixture.RegisterAdminAsync(_factory);
        var member = await ApiFixture.InviteAndRegisterAsync(
            _factory, admin, "member@test.local", password: "member password");

        await ResetAsync(admin.Email);

        (await LoginAsync("member@test.local", "member password")).EnsureSuccessStatusCode();
        (await member.Client.GetAsync("/api/auth/me")).EnsureSuccessStatusCode();
    }
}
