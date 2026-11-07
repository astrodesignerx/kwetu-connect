using System.IdentityModel.Tokens.Jwt;
using System.Net;
using System.Net.Http.Json;
using Kompanion.Api.Auth;
using Microsoft.AspNetCore.Hosting;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace Kompanion.Api.Tests;

public class DevelopmentLoginTests : IAsyncLifetime
{
    private TestAppFactory _factory = null!;

    public async ValueTask InitializeAsync()
    {
        _factory = new TestAppFactory();
        await _factory.InitializeAsync();
    }

    public async ValueTask DisposeAsync() => await _factory.DisposeAsync();

    [Fact]
    public async Task Shortcut_issues_a_development_token_without_changing_the_admin_password()
    {
        var admin = await ApiFixture.RegisterAdminAsync(_factory);
        await using var db = _factory.NewDbContext();
        var before = (await db.Users.AsNoTracking().SingleAsync(u => u.Id == admin.UserId)).PasswordHash;
        var session = await ApiFixture.LoginAsync(_factory, "@admin", "@admin");
        Assert.Equal(admin.UserId, session.UserId);
        Assert.True(new JwtSecurityTokenHandler().ReadJwtToken(session.Token).Claims
            .Any(c => c.Type == JwtTokenService.DevelopmentOnlyClaim));
        Assert.Equal(before, (await db.Users.AsNoTracking().SingleAsync(u => u.Id == admin.UserId)).PasswordHash);
        (await session.Client.GetAsync("/api/auth/me")).EnsureSuccessStatusCode();
        var normal = await ApiFixture.LoginAsync(_factory, admin.Email, "correct horse battery");
        Assert.Equal(admin.UserId, normal.UserId);
    }

    [Fact]
    public async Task Shortcut_bootstraps_an_empty_development_database_without_storing_the_shortcut_password()
    {
        var session = await ApiFixture.LoginAsync(_factory, "@admin", "@admin");
        await using var db = _factory.NewDbContext();
        var user = await db.Users.SingleAsync(u => u.Id == session.UserId);
        Assert.Equal(Kompanion.Api.Data.UserRole.Admin, user.Role);
        Assert.Equal(Microsoft.AspNetCore.Identity.PasswordVerificationResult.Failed,
            new Microsoft.AspNetCore.Identity.PasswordHasher<Kompanion.Api.Data.User>()
                .VerifyHashedPassword(user, user.PasswordHash, "@admin"));
    }

    [Theory]
    [InlineData("Production")]
    [InlineData("Staging")]
    public async Task Nondevelopment_rejects_the_shortcut_and_its_token_but_accepts_normal_login(string environment)
    {
        var admin = await ApiFixture.RegisterAdminAsync(_factory);
        var development = await ApiFixture.LoginAsync(_factory, "@admin", "@admin");
        using var host = _factory.WithWebHostBuilder(builder => builder.UseEnvironment(environment));
        using var client = host.CreateClient();
        var shortcut = await client.PostAsJsonAsync("/api/auth/login", new { identifier = "@admin", password = "@admin" });
        Assert.Equal(HttpStatusCode.Unauthorized, shortcut.StatusCode);
        client.DefaultRequestHeaders.Authorization = new("Bearer", development.Token);
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/auth/me")).StatusCode);
        client.DefaultRequestHeaders.Authorization = new("Bearer", admin.Token);
        (await client.GetAsync("/api/auth/me")).EnsureSuccessStatusCode();
    }

    [Fact]
    public async Task Incorrect_shortcut_password_is_rejected()
    {
        await ApiFixture.RegisterAdminAsync(_factory);
        var response = await _factory.CreateClient().PostAsJsonAsync("/api/auth/login",
            new { identifier = "@admin", password = "wrong" });
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }
}
