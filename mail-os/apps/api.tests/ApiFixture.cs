using System.Net.Http.Headers;
using System.Net.Http.Json;
using Kompanion.Api.Data;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace Kompanion.Api.Tests;

/// <summary>Helpers shared by the integration tests: sign-up, sign-in, and seeding mail rows.</summary>
public static class ApiFixture
{
    public record Session(HttpClient Client, Guid UserId, string Email, string Token);

    /// <summary>
    /// Creates the bootstrap admin. Only valid as the very first account in a fresh
    /// database — every account after it needs an invitation.
    /// </summary>
    public static async Task<Session> RegisterAdminAsync(TestAppFactory factory,
        string email = "admin@test.local", string password = "correct horse battery")
    {
        var client = factory.CreateClient();
        var res = await client.PostAsJsonAsync("/api/auth/register", new
        {
            email,
            password,
            displayName = "Test Admin"
        });
        res.EnsureSuccessStatusCode();

        var body = await res.Content.ReadFromJsonAsync<AuthBody>();
        return Authenticated(factory, body!);
    }

    /// <summary>Invites an address as <paramref name="admin"/>, then registers it.</summary>
    public static async Task<Session> InviteAndRegisterAsync(TestAppFactory factory, Session admin,
        string email, string role = "Member", string password = "another good password")
    {
        var invite = await admin.Client.PostAsJsonAsync("/api/admin/invitations", new { email, role });
        invite.EnsureSuccessStatusCode();
        var token = (await invite.Content.ReadFromJsonAsync<InviteBody>())!.Token;

        var client = factory.CreateClient();
        var res = await client.PostAsJsonAsync("/api/auth/register", new
        {
            email,
            password,
            displayName = email.Split('@')[0],
            inviteToken = token
        });
        res.EnsureSuccessStatusCode();

        var body = await res.Content.ReadFromJsonAsync<AuthBody>();
        return Authenticated(factory, body!);
    }

    public static async Task<string> CreateInviteTokenAsync(Session admin, string email, string role = "Member")
    {
        var res = await admin.Client.PostAsJsonAsync("/api/admin/invitations", new { email, role });
        res.EnsureSuccessStatusCode();
        return (await res.Content.ReadFromJsonAsync<InviteBody>())!.Token;
    }

    /// <param name="identifier">Email address or display name.</param>
    public static async Task<Session> LoginAsync(TestAppFactory factory, string identifier, string password)
    {
        var client = factory.CreateClient();
        var res = await client.PostAsJsonAsync("/api/auth/login", new { identifier, password });
        res.EnsureSuccessStatusCode();
        var body = await res.Content.ReadFromJsonAsync<AuthBody>();
        return Authenticated(factory, body!);
    }

    /// <summary>An HttpClient carrying an explicit bearer token (used to test stale tokens).</summary>
    public static HttpClient ClientWithToken(TestAppFactory factory, string token)
    {
        var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);
        return client;
    }

    /// <summary>
    /// Inserts the minimum mail rows a thread needs: a connection, a folder, a thread and
    /// one message. Sync itself is not exercised — these tests are about the API surface.
    /// </summary>
    public static async Task<(Guid ConnectionId, Guid ThreadId, long MessageId)> SeedThreadAsync(
        TestAppFactory factory, Guid ownerUserId, string subject = "Test thread")
    {
        await using var db = factory.NewDbContext();

        var connection = new MailboxConnection
        {
            UserId = ownerUserId,
            Email = $"mailbox-{Guid.NewGuid():N}@test.local",
            ImapHost = "imap.test.local",
            SmtpHost = "smtp.test.local",
            EncryptedCredentials = [1, 2, 3]
        };
        db.MailboxConnections.Add(connection);

        var folder = new MailboxFolder
        {
            MailboxConnectionId = connection.Id,
            FullName = "INBOX",
            UidValidity = 1,
            SpecialUse = FolderSpecialUse.Inbox
        };
        db.MailboxFolders.Add(folder);

        var thread = new MailThread
        {
            MailboxConnectionId = connection.Id,
            RootKey = Guid.NewGuid().ToString("N"),
            Subject = subject,
            MessageCount = 1,
            FirstDate = DateTimeOffset.UtcNow,
            LastDate = DateTimeOffset.UtcNow
        };
        db.MailThreads.Add(thread);

        var message = new MailMessage
        {
            MailboxConnectionId = connection.Id,
            FolderId = folder.Id,
            ThreadId = thread.Id,
            Uid = 1,
            UidValidity = 1,
            MessageId = $"<{Guid.NewGuid():N}@test.local>",
            Subject = subject,
            FromAddr = "sender@example.com",
            ToAddrs = "recipient@test.local",
            MessageDate = DateTimeOffset.UtcNow
        };
        db.MailMessages.Add(message);

        await db.SaveChangesAsync();
        return (connection.Id, thread.Id, message.Id);
    }

    private static Session Authenticated(TestAppFactory factory, AuthBody body)
    {
        var client = ClientWithToken(factory, body.Token);
        return new Session(client, body.User.Id, body.User.Email, body.Token);
    }

    private record AuthBody(string Token, UserBody User);
    private record UserBody(Guid Id, string Email, string DisplayName, string Role);
    private record InviteBody(string Token);
}
