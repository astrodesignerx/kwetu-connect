using System.Net.Security;
using System.Security.Cryptography.X509Certificates;

namespace Kompanion.Api.Services.Mail;

/// <summary>
/// The single TLS rule for every mail connection: accept only a valid chain for
/// the configured host. A certificate whose name happens to match the host but
/// whose chain is broken or expired is still rejected, there is no fallback.
/// </summary>
public static class TlsValidation
{
    public static bool AcceptValidChainOnly(
        object? sender,
        X509Certificate? certificate,
        X509Chain? chain,
        SslPolicyErrors errors) => errors == SslPolicyErrors.None;
}
