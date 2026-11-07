using Kompanion.Api.Services.Mail;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace Kompanion.Api.Tests;

/// <summary>
/// The production mail graph resolves from a plain host: no fake replaces these,
/// so a missing registration would only surface at runtime.
/// </summary>
public sealed class MailServicesRegistrationTests : IAsyncLifetime
{
    private TestAppFactory _factory = null!;

    public async ValueTask InitializeAsync()
    {
        _factory = new TestAppFactory();
        await _factory.InitializeAsync();
    }

    public async ValueTask DisposeAsync() => await _factory.DisposeAsync();

    [Fact]
    public void Production_mail_services_resolve()
    {
        using var scope = _factory.Services.CreateScope();
        var provider = scope.ServiceProvider;

        Assert.NotNull(provider.GetRequiredService<IMailSessionFactory>());
        Assert.NotNull(provider.GetRequiredService<ISmtpTransport>());
        Assert.NotNull(provider.GetRequiredService<ISentCopyFiler>());
        Assert.NotNull(provider.GetRequiredService<SmtpSender>());
        Assert.NotNull(provider.GetRequiredService<MailComposer>());
        Assert.NotNull(provider.GetRequiredService<MailActionService>());
        Assert.NotNull(provider.GetRequiredService<MailIngestor>());
    }
}
