using Kompanion.Api.Services;
using Kompanion.Api.Services.Mail;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
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
    private FakeMailTestFactory _factory = null!;

    public async ValueTask InitializeAsync()
    {
        _factory = new FakeMailTestFactory(new Dictionary<string, string> { ["App:WebBaseUrl"] = "https://kwetu.test" });
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
    [Theory]
    [InlineData("Member")]
    [InlineData("Admin")]
    public async Task Invitation_grants_exactly_selected_existing_mailboxes(string role)
    {
        var ct = TestContext.Current.CancellationToken;
        var admin = await ApiFixture.RegisterAdminAsync(_factory);
        var (one, _, _) = await ApiFixture.SeedThreadAsync(_factory, admin.UserId);
        var (two, _, _) = await ApiFixture.SeedThreadAsync(_factory, admin.UserId);
        var (deleted, _, _) = await ApiFixture.SeedThreadAsync(_factory, admin.UserId);
        await ApiFixture.SeedThreadAsync(_factory, admin.UserId);
        var response = await admin.Client.PostAsJsonAsync("/api/admin/invitations", new
        {
            email = "invitee@test.local", role, mailboxIds = new[] { one, two, deleted, one }
        }, ct);
        response.EnsureSuccessStatusCode();
        var created = await response.Content.ReadFromJsonAsync<JsonElement>(ct);
        var token = created.GetProperty("token").GetString();
        Assert.Equal(role == "Admin" ? 0 : 3, created.GetProperty("invitation").GetProperty("mailboxIds").GetArrayLength());
        (await admin.Client.DeleteAsync($"/api/mailboxes/{deleted}", ct)).EnsureSuccessStatusCode();
        var registered = await _factory.CreateClient().PostAsJsonAsync("/api/auth/register", new
        {
            email = "invitee@test.local", password = "another good password", displayName = "Invitee", inviteToken = token
        }, ct);
        registered.EnsureSuccessStatusCode();
        var userId = (await registered.Content.ReadFromJsonAsync<JsonElement>(ct)).GetProperty("user").GetProperty("id").GetGuid();
        await using var db = _factory.NewDbContext();
        var grants = await db.MailboxAccess.Where(a => a.UserId == userId).Select(a => a.MailboxConnectionId).ToListAsync(ct);
        Assert.Equal(role == "Admin" ? 0 : 2, grants.Count);
        if (role == "Member") Assert.Equal(new[] { one, two }.Order(), grants.Order());
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task Invitation_email_uses_transport_and_failure_preserves_the_invitation(bool fails)
    {
        var ct = TestContext.Current.CancellationToken;
        var admin = await ApiFixture.RegisterAdminAsync(_factory);
        var (box, _, _) = await ApiFixture.SeedThreadAsync(_factory, admin.UserId);
        string? plain = null, html = null;
        _factory.Smtp.OnSend = message =>
        {
            plain = message.TextBody; html = message.HtmlBody;
            Assert.Equal("invited@test.local", message.To.Mailboxes.Single().Address);
            return fails ? new IOException("simulated transport failure") : null;
        };
        var result = await admin.Client.PostAsJsonAsync("/api/admin/invitations", new
        {
            email = "invited@test.local", role = "Member", mailboxIds = new[] { box }, sendFromMailboxId = box
        }, ct);
        Assert.Equal(HttpStatusCode.OK, result.StatusCode);
        var body = await result.Content.ReadFromJsonAsync<JsonElement>(ct);
        Assert.Equal(!fails, body.GetProperty("emailSent").GetBoolean());
        Assert.Equal(fails ? JsonValueKind.String : JsonValueKind.Null, body.GetProperty("emailError").ValueKind);
        var token = body.GetProperty("token").GetString()!;
        var link = "https://kwetu.test/register?invite=" + token;
        Assert.Contains(link, plain);
        Assert.Contains(link, html);
        Assert.DoesNotContain(token, plain!.Replace(link, ""));
        Assert.DoesNotContain(token, html!.Replace(link, ""));
        Assert.Contains("Test Admin invited you to Kwetu OS", plain);
        Assert.Contains("7 days", plain);
        Assert.Equal(fails ? 0 : 1, _factory.Filer.FileCount);
        await using var db = _factory.NewDbContext();
        var invitation = await db.Invitations.SingleAsync(i => i.Email == "invited@test.local", ct);
        Assert.Equal(Kompanion.Api.Controllers.AuthController.HashToken(token), invitation.TokenHash);
        Assert.Empty(await db.MailDrafts.ToListAsync(ct));
        Assert.Empty(await db.SendOperations.ToListAsync(ct));
        Assert.Contains(await db.AuditLogEntries.Where(a => a.Action == "admin.invitation.create").Select(a => a.Details).ToListAsync(ct),
            detail => detail != null && detail.Contains(box.ToString()) && detail.Contains($"email sent {!fails}"));
    }

    [Theory]
    [InlineData("https://configured.test", "https://fallback.test", true, "https://configured.test")]
    [InlineData(null, "https://fallback.test", true, "https://fallback.test")]
    [InlineData(null, null, false, null)]
    [InlineData("invalid", "https://fallback.test", false, null)]
    public async Task Invitation_mailer_resolves_the_configured_or_first_CORS_web_address(string? configured,
        string? fallback, bool sent, string? expectedBase)
    {
        var ct = TestContext.Current.CancellationToken;
        var admin = await ApiFixture.RegisterAdminAsync(_factory);
        var (box, _, _) = await ApiFixture.SeedThreadAsync(_factory, admin.UserId);
        using var scope = _factory.Services.CreateScope();
        await using var db = _factory.NewDbContext();
        var connection = await db.MailboxConnections.Include(c => c.User).SingleAsync(c => c.Id == box, ct);
        var config = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["App:WebBaseUrl"] = configured, ["Cors:WebOrigins:0"] = fallback
        }).Build();
        var mailer = new InvitationMailer(_factory.Smtp, scope.ServiceProvider.GetRequiredService<SmtpSender>(), config);
        string? text = null;
        _factory.Smtp.OnSend = message => { text = message.TextBody; return null; };
        var result = await mailer.SendAsync(new Invitation { OrganizationId = connection.User.OrganizationId,
            CreatedByUserId = admin.UserId, Email = "invite@test.local", TokenHash = "unused" }, "one-token",
            "Inviter", connection, [], ct);
        Assert.Equal(sent, result.Sent);
        if (sent)
        {
            Assert.Null(result.Error);
            Assert.Contains(expectedBase + "/register?invite=one-token", text);
        }
        else
        {
            Assert.False(string.IsNullOrWhiteSpace(result.Error));
            Assert.Equal(0, _factory.Smtp.SendCount);
        }
    }


    [Fact]
    public async Task Invitation_preview_greets_the_person_and_omits_deleted_and_foreign_mailboxes()
    {
        var admin = await ApiFixture.RegisterAdminAsync(_factory);
        var (box, _, _) = await ApiFixture.SeedThreadAsync(_factory, admin.UserId);
        var token = await ApiFixture.CreateInviteTokenAsync(admin, "preview@test.local");
        DateTimeOffset expiry;
        string address;
        await using (var db = _factory.NewDbContext())
        {
            var invitation = await db.Invitations.SingleAsync(TestContext.Current.CancellationToken);
            invitation.MailboxIds = [box, Guid.NewGuid()];
            expiry = invitation.ExpiresAt;
            address = (await db.MailboxConnections.FindAsync([box], TestContext.Current.CancellationToken))!.Email;
            await db.SaveChangesAsync(TestContext.Current.CancellationToken);
        }
        using var client = _factory.CreateClient();
        var response = await client.GetAsync($"/api/auth/invitations/preview?token={token}", TestContext.Current.CancellationToken);
        response.EnsureSuccessStatusCode();
        var body = await response.Content.ReadFromJsonAsync<JsonElement>(TestContext.Current.CancellationToken);
        Assert.Equal("preview@test.local", body.GetProperty("email").GetString());
        Assert.Equal("Test Admin", body.GetProperty("invitedByName").GetString());
        Assert.Equal("Member", body.GetProperty("role").GetString());
        Assert.Equal(address, Assert.Single(body.GetProperty("mailboxes").EnumerateArray()).GetString());
        Assert.Equal(expiry, body.GetProperty("expiresAt").GetDateTimeOffset());
        Assert.True(response.Headers.CacheControl!.NoStore);
    }

    [Theory]
    [InlineData("used")]
    [InlineData("revoked")]
    [InlineData("expired")]
    [InlineData("unknown")]
    public async Task Unusable_invitation_previews_are_all_404(string state)
    {
        var admin = await ApiFixture.RegisterAdminAsync(_factory);
        var token = await ApiFixture.CreateInviteTokenAsync(admin, "preview@test.local");
        await using (var db = _factory.NewDbContext())
        {
            var invitation = await db.Invitations.SingleAsync(TestContext.Current.CancellationToken);
            if (state == "used") invitation.AcceptedAt = DateTimeOffset.UtcNow;
            if (state == "revoked") invitation.RevokedAt = DateTimeOffset.UtcNow;
            if (state == "expired") invitation.ExpiresAt = DateTimeOffset.UtcNow.AddSeconds(-1);
            await db.SaveChangesAsync(TestContext.Current.CancellationToken);
        }
        if (state == "unknown") token = "unknown";
        using var client = _factory.CreateClient();
        var response = await client.GetAsync($"/api/auth/invitations/preview?token={token}", TestContext.Current.CancellationToken);
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Equal("{}", await response.Content.ReadAsStringAsync(TestContext.Current.CancellationToken));
    }
}
