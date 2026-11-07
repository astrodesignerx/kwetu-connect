using Kompanion.Api.Services.Mail;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;

namespace Kompanion.Api.Tests;

/// <summary>
/// <see cref="TestAppFactory"/> with the mail seams replaced by scripted fakes: no
/// sockets, no real mailboxes. Tests program <see cref="Mail"/> and
/// <see cref="Smtp"/> and drive the real API pipeline around them.
/// </summary>
public sealed class FakeMailTestFactory : TestAppFactory
{
    public FakeMailSessionFactory Mail { get; } = new();
    public FakeSmtpTransport Smtp { get; } = new();
    public FakeSentCopyFiler Filer { get; } = new();

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        base.ConfigureWebHost(builder);
        builder.ConfigureServices(services =>
        {
            services.RemoveAll<IMailSessionFactory>();
            services.RemoveAll<ISmtpTransport>();
            services.RemoveAll<ISentCopyFiler>();
            services.AddSingleton<IMailSessionFactory>(Mail);
            services.AddSingleton<ISmtpTransport>(Smtp);
            services.AddSingleton<ISentCopyFiler>(Filer);
        });
    }
}
