using System.Net.Security;
using MailKit.Net.Imap;
using MailKit.Security;

namespace Kompanion.Api.Services;

/// <summary>
/// Verifies mailbox credentials with a real IMAP LOGIN before they are stored.
/// Certificate policy is strict: the server must present a valid chain for the
/// configured host. A hostname learned from a rejected certificate is never
/// followed, when the provider serves its own certificate on the generic host,
/// configure the provider hostname explicitly instead.
/// </summary>
public class MailboxVerifier
{
    private readonly ILogger<MailboxVerifier> _logger;

    public MailboxVerifier(ILogger<MailboxVerifier> logger) => _logger = logger;

    public async Task<(bool Ok, string? Error, string? ResolvedHost)> VerifyImapLoginAsync(
        string host, int port, string email, string password, CancellationToken ct)
    {
        var result = await TryLoginAsync(host, port, email, password, ct);
        if (result.Ok) return (true, null, host);
        _logger.LogWarning("Mailbox verification failed for {Host}: {Error}", host, result.Error);
        return (false, result.Error, null);
    }

    private static async Task<(bool Ok, string? Error)> TryLoginAsync(
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
            return (true, null);
        }
        catch (SslHandshakeException)
        {
            return (false, $"TLS certificate validation failed for '{host}'.");
        }
        catch (MailKit.Security.AuthenticationException)
        {
            return (false, "The server rejected the email/password combination.");
        }
        catch (Exception ex)
        {
            return (false, $"Could not connect to '{host}:{port}', {ex.Message}");
        }
    }
}
