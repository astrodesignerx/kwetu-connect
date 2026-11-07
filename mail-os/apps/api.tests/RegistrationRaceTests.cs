using System.Net;
using System.Net.Http.Json;
using Kompanion.Api.Data;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace Kompanion.Api.Tests;

/// <summary>
/// Bootstrap registration admits exactly one admin however many callers race, and
/// one invitation redeems exactly once. Failures roll account and invitation
/// changes back together.
/// </summary>
public sealed class RegistrationRaceTests : IAsyncLifetime
{
    private TestAppFactory _factory = null!;

    public async ValueTask InitializeAsync()
    {
        _factory = new TestAppFactory();
        await _factory.InitializeAsync();
    }

    public async ValueTask DisposeAsync() => await _factory.DisposeAsync();

    [Fact]
    public async Task Parallel_first_registrations_yield_one_admin()
    {
        var tasks = Enumerable.Range(0, 6).Select(i =>
            _factory.CreateClient().PostAsJsonAsync("/api/auth/register", new
            {
                email = $"racer{i}@test.local",
                password = "password12345",
                displayName = $"Racer {i}"
            })).ToList();
        var responses = await Task.WhenAll(tasks);

        var succeeded = responses.Count(r => r.IsSuccessStatusCode);
        Assert.Equal(1, succeeded);

        await using var db = _factory.NewDbContext();
        Assert.Equal(1, await db.Users.CountAsync());
        var user = await db.Users.SingleAsync();
        Assert.Equal(UserRole.Admin, user.Role);
    }

    [Fact]
    public async Task Invitation_redeem_race_yields_one_account()
    {
        var admin = await ApiFixture.RegisterAdminAsync(_factory);
        var token = await ApiFixture.CreateInviteTokenAsync(admin, "raced@test.local");

        var payload = new
        {
            email = "raced@test.local",
            password = "password12345",
            displayName = "Raced",
            inviteToken = token
        };
        var tasks = new[]
        {
            _factory.CreateClient().PostAsJsonAsync("/api/auth/register", payload),
            _factory.CreateClient().PostAsJsonAsync("/api/auth/register", payload)
        };
        var responses = await Task.WhenAll(tasks);

        Assert.Equal(1, responses.Count(r => r.IsSuccessStatusCode));
        Assert.All(responses.Where(r => !r.IsSuccessStatusCode),
            r => Assert.True(r.StatusCode is HttpStatusCode.BadRequest or HttpStatusCode.Conflict));

        await using var db = _factory.NewDbContext();
        Assert.Equal(1, await db.Users.CountAsync(u => u.Email == "raced@test.local"));
        var invitation = await db.Invitations.SingleAsync(i => i.Email == "raced@test.local");
        Assert.NotNull(invitation.AcceptedAt);
    }

    [Fact]
    public async Task Duplicate_email_maps_to_conflict_not_server_error()
    {
        var admin = await ApiFixture.RegisterAdminAsync(_factory);
        var token = await ApiFixture.CreateInviteTokenAsync(admin, "dupe@test.local");
        var payload = new
        {
            email = "dupe@test.local",
            password = "password12345",
            displayName = "Dupe",
            inviteToken = token
        };
        (await _factory.CreateClient().PostAsJsonAsync("/api/auth/register", payload)).EnsureSuccessStatusCode();

        // Same email again: the pre-check rejects it before any insert is attempted.
        var retry = await _factory.CreateClient().PostAsJsonAsync("/api/auth/register", payload with { displayName = "Dupe Again" });
        Assert.Equal(HttpStatusCode.Conflict, retry.StatusCode);
        var body = await retry.Content.ReadAsStringAsync();
        Assert.Contains("already exists", body);
    }
}
