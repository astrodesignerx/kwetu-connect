using System.Net.Security;
using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;
using Kompanion.Api.Services.Mail;
using Xunit;

namespace Kompanion.Api.Tests;

/// <summary>
/// Mail connections must reject anything but a valid chain for the configured host.
/// A forged or expired certificate whose name happens to match must not pass.
/// </summary>
public sealed class TlsValidationTests
{
    [Fact]
    public void Valid_chain_is_accepted()
    {
        Assert.True(TlsValidation.AcceptValidChainOnly(null, null, null, SslPolicyErrors.None));
    }

    [Theory]
    [InlineData(SslPolicyErrors.RemoteCertificateChainErrors)]
    [InlineData(SslPolicyErrors.RemoteCertificateNameMismatch)]
    [InlineData(SslPolicyErrors.RemoteCertificateNotAvailable)]
    public void Any_chain_error_is_rejected(SslPolicyErrors errors)
    {
        Assert.False(TlsValidation.AcceptValidChainOnly(null, null, null, errors));
    }

    [Fact]
    public void Matching_name_with_chain_errors_is_rejected()
    {
        // The old policy accepted a certificate whose DNS name matched the stored
        // host even when the chain was broken. A self-signed cert for the exact
        // host must still fail.
        using var cert = SelfSigned("webmail.test.local");
        Assert.False(TlsValidation.AcceptValidChainOnly(
            null, cert, null,
            SslPolicyErrors.RemoteCertificateChainErrors | SslPolicyErrors.RemoteCertificateNameMismatch));
        Assert.True(TlsValidation.AcceptValidChainOnly(null, cert, null, SslPolicyErrors.None));
    }

    private static X509Certificate2 SelfSigned(string dnsName)
    {
        using var rsa = RSA.Create(2048);
        var req = new CertificateRequest(
            $"CN={dnsName}", rsa, HashAlgorithmName.SHA256, RSASignaturePadding.Pkcs1);
        req.CertificateExtensions.Add(
            new X509BasicConstraintsExtension(false, false, 0, false));
        return req.CreateSelfSigned(DateTimeOffset.UtcNow.AddDays(-1), DateTimeOffset.UtcNow.AddDays(30));
    }
}
