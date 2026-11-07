using System.Text;
using Microsoft.AspNetCore.DataProtection;

namespace Kompanion.Api.Services;

/// <summary>
/// Encrypts mailbox credentials at rest using ASP.NET Core Data Protection.
/// The key ring is persisted outside the database (infra/dpkeys in dev, a mounted
/// volume in production), so a database dump alone cannot decrypt credentials.
/// </summary>
public class CredentialVault
{
    private readonly IDataProtector _protector;

    public CredentialVault(IDataProtectionProvider provider)
        => _protector = provider.CreateProtector("Kompanion.MailboxCredentials.v1");

    public byte[] Protect(string plaintext) =>
        _protector.Protect(Encoding.UTF8.GetBytes(plaintext));

    public string Unprotect(byte[] protectedBytes) =>
        Encoding.UTF8.GetString(_protector.Unprotect(protectedBytes));
}
