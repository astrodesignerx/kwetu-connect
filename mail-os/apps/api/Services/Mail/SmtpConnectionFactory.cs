using System.Net.Security;
using Kompanion.Api.Data;
using MailKit.Security;
using MailKit.Net.Smtp;

namespace Kompanion.Api.Services.Mail;

/// <summary>
/// Authenticating SMTP connections for sending. Certificate policy: the server must
/// present a valid chain for the stored host. Configure the provider hostname the
/// certificate is issued to (the documented cPanel host) when the generic
/// webmail host does not match it. Anything else is rejected.
/// </summary>
public class SmtpConnectionFactory
{
    private readonly CredentialVault _vault;

    public SmtpConnectionFactory(CredentialVault vault) => _vault = vault;

    public async Task<SmtpClient> ConnectAsync(MailboxConnection connection, CancellationToken ct)
    {
        var password = _vault.Unprotect(connection.EncryptedCredentials);
        var client = new SmtpClient { Timeout = 60000 };
        client.ServerCertificateValidationCallback = TlsValidation.AcceptValidChainOnly;
        try
        {
            await client.ConnectAsync(connection.SmtpHost, connection.SmtpPort, SecureSocketOptions.SslOnConnect, ct);
            await client.AuthenticateAsync(connection.Email, password, ct);
            return client;
        }
        catch
        {
            client.Dispose();
            throw;
        }
    }
}
