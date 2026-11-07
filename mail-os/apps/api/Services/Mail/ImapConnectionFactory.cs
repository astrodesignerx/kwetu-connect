using System.Net.Security;
using Kompanion.Api.Data;
using MailKit.Net.Imap;
using MailKit.Security;

namespace Kompanion.Api.Services.Mail;

/// <summary>
/// Opens authenticated IMAP connections for a stored mailbox connection, decrypting
/// credentials from the vault. Certificate policy: the server must present a valid
/// chain for the stored host. Anything else is rejected.
/// </summary>
public class ImapConnectionFactory
{
    private readonly CredentialVault _vault;

    public ImapConnectionFactory(CredentialVault vault) => _vault = vault;

    public async Task<ImapClient> ConnectAsync(MailboxConnection connection, CancellationToken ct)
    {
        var password = _vault.Unprotect(connection.EncryptedCredentials);
        var client = new ImapClient { Timeout = 60000 };
        client.ServerCertificateValidationCallback = TlsValidation.AcceptValidChainOnly;
        try
        {
            await client.ConnectAsync(connection.ImapHost, connection.ImapPort, SecureSocketOptions.SslOnConnect, ct);
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
