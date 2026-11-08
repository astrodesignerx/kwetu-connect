using MailKit.Net.Imap;
using MailKit.Net.Smtp;
using MailKit.Security;

namespace Kompanion.Api.Services;

/// <summary>Outcome of one sign-in attempt against one server.</summary>
public record MailLoginResult(bool Ok, string? Error, bool CredentialsRejected);

/// <summary>Outcome of trying a list of servers. Host is null when none accepted the sign-in.</summary>
public record MailHostSearch(string? Host, string? Error, bool CredentialsRejected);

/// <summary>
/// Verifies mailbox credentials with a real IMAP and SMTP sign-in before they are stored.
/// Certificate policy is strict: the server must present a valid chain for the
/// configured host. A hostname learned from a rejected certificate is never
/// followed, when the provider serves its own certificate on the generic host,
/// configure the provider hostname explicitly instead.
/// </summary>
public class MailboxVerifier
{
    private readonly ILogger<MailboxVerifier> _logger;

    public MailboxVerifier(ILogger<MailboxVerifier> logger) => _logger = logger;

    /// <summary>Where cPanel-style hosts usually serve IMAP, most likely first.</summary>
    public static IReadOnlyList<string> ImapCandidates(string domain) =>
        [$"webmail.{domain}", $"mail.{domain}"];

    /// <summary>
    /// Where hosts usually serve SMTP. "mail." comes first because a host's "webmail."
    /// name often answers IMAP but never answers on the submission port.
    /// </summary>
    public static IReadOnlyList<string> SmtpCandidates(string domain, string imapHost) =>
        new[] { $"mail.{domain}", imapHost, $"smtp.{domain}" }
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();

    public Task<MailHostSearch> FindImapHostAsync(IReadOnlyList<string> hosts, int port,
        string email, string password, CancellationToken ct) =>
        FindHostAsync(hosts, host => CheckImapAsync(host, port, email, password, ct));

    public Task<MailHostSearch> FindSmtpHostAsync(IReadOnlyList<string> hosts, int port,
        string email, string password, CancellationToken ct) =>
        FindHostAsync(hosts, host => CheckSmtpAsync(host, port, email, password, ct));

    public async Task<(bool Ok, string? Error, string? ResolvedHost)> VerifyImapLoginAsync(
        string host, int port, string email, string password, CancellationToken ct)
    {
        var result = await CheckImapAsync(host, port, email, password, ct);
        if (result.Ok) return (true, null, host);
        _logger.LogWarning("Mailbox verification failed for {Host}: {Error}", host, result.Error);
        return (false, result.Error, null);
    }

    // A rejected password ends the search. Every candidate is usually the same server,
    // and repeating a bad password against it can get the address locked out.
    private async Task<MailHostSearch> FindHostAsync(
        IReadOnlyList<string> hosts, Func<string, Task<MailLoginResult>> check)
    {
        string? lastError = null;
        foreach (var host in hosts)
        {
            var result = await check(host);
            if (result.Ok) return new MailHostSearch(host, null, false);

            _logger.LogWarning("Mailbox verification failed for {Host}: {Error}", host, result.Error);
            if (result.CredentialsRejected) return new MailHostSearch(null, result.Error, true);
            lastError = result.Error;
        }
        return new MailHostSearch(null, lastError, false);
    }

    public virtual async Task<MailLoginResult> CheckImapAsync(
        string host, int port, string email, string password, CancellationToken ct)
    {
        using var client = new ImapClient { Timeout = 15000 };
        client.ServerCertificateValidationCallback =
            Services.Mail.TlsValidation.AcceptValidChainOnly; // never silently accept an invalid certificate

        try
        {
            await client.ConnectAsync(host, port, SecureSocketOptions.SslOnConnect, ct);
            await client.AuthenticateAsync(email, password, ct);
            await client.DisconnectAsync(true, ct);
            return new MailLoginResult(true, null, false);
        }
        catch (Exception ex)
        {
            return Describe(ex, host, port);
        }
    }

    /// <summary>Signs in to SMTP and disconnects. No message is sent.</summary>
    public virtual async Task<MailLoginResult> CheckSmtpAsync(
        string host, int port, string email, string password, CancellationToken ct)
    {
        using var client = new SmtpClient { Timeout = 10000 };
        client.ServerCertificateValidationCallback =
            Services.Mail.TlsValidation.AcceptValidChainOnly;

        try
        {
            await client.ConnectAsync(host, port, SecureSocketOptions.SslOnConnect, ct);
            await client.AuthenticateAsync(email, password, ct);
            await client.DisconnectAsync(true, ct);
            return new MailLoginResult(true, null, false);
        }
        catch (Exception ex)
        {
            return Describe(ex, host, port);
        }
    }

    private static MailLoginResult Describe(Exception ex, string host, int port) => ex switch
    {
        SslHandshakeException => new(false, $"TLS certificate validation failed for '{host}'.", false),
        AuthenticationException => new(false, "The server rejected the email/password combination.", true),
        _ => new(false, $"Could not connect to '{host}:{port}', {ex.Message}", false),
    };
}
