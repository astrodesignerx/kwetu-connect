using Kompanion.Api.Data;
using Kompanion.Api.Services.Mail;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.FileProviders;
using Xunit;

namespace Kompanion.Api.Tests;

/// <summary>
/// Focused failure tests for the send seams: filing after acceptance never fails
/// the send, transport failures propagate, and a pinned Message-ID goes on the wire.
/// </summary>
public sealed class SmtpSenderTests : IDisposable
{
    private readonly string _storeDir;
    private readonly AttachmentStore _store;

    public SmtpSenderTests()
    {
        _storeDir = Path.Combine(Path.GetTempPath(), "ccos-sender-tests", Guid.NewGuid().ToString("N"));
        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?> { ["Attachments:Path"] = _storeDir })
            .Build();
        _store = new AttachmentStore(config, new FakeEnv(_storeDir), NullLogger<AttachmentStore>.Instance);
    }

    public void Dispose()
    {
        try { Directory.Delete(_storeDir, recursive: true); } catch { /* best effort */ }
    }

    [Fact]
    public async Task Filing_failure_after_acceptance_still_succeeds()
    {
        var transport = new FakeSmtpTransport();
        var filer = new FakeSentCopyFiler { ThrowOnFile = true };
        var sender = new SmtpSender(transport, filer, _store, NullLogger<SmtpSender>.Instance);
        var (connection, draft) = Parts();

        var sent = await sender.SendAsync(connection, draft, null, null, CancellationToken.None);
        await sender.FileSentCopyAsync(connection, sent.Mime, CancellationToken.None);

        Assert.False(string.IsNullOrEmpty(sent.MessageId));
        Assert.Equal(1, transport.SendCount);
        Assert.Equal(1, filer.FileCount);
        Assert.Equal(sent.MessageId, transport.Sent.Single().MessageId);
    }

    [Fact]
    public async Task Pinned_message_id_goes_on_the_wire()
    {
        var transport = new FakeSmtpTransport();
        var sender = new SmtpSender(transport, new FakeSentCopyFiler(), _store, NullLogger<SmtpSender>.Instance);
        var (connection, draft) = Parts();

        const string pinned = "<stable-id@test.local>";
        var sent = await sender.SendAsync(connection, draft, null, null, CancellationToken.None, pinned);

        // MimeKit parses the id: the angle brackets live on the wire, not the property.
        Assert.Equal(pinned, "<" + sent.MessageId + ">");
        Assert.Equal(pinned, "<" + transport.Sent.Single().MessageId + ">");
    }

    [Fact]
    public async Task Transport_failure_propagates()
    {
        var transport = new FakeSmtpTransport
        {
            OnSend = _ => new IOException("Simulated mid-send failure.")
        };
        var sender = new SmtpSender(transport, new FakeSentCopyFiler(), _store, NullLogger<SmtpSender>.Instance);
        var (connection, draft) = Parts();

        await Assert.ThrowsAsync<IOException>(() =>
            sender.SendAsync(connection, draft, null, null, CancellationToken.None));
    }

    [Fact]
    public async Task Build_failure_before_transport_is_typed_not_sent()
    {
        var transport = new FakeSmtpTransport();
        var sender = new SmtpSender(transport, new FakeSentCopyFiler(), _store, NullLogger<SmtpSender>.Instance);
        var (connection, draft) = Parts();
        var missing = new MailAttachment
        {
            FileName = "gone.txt",
            BlobKey = new string('0', 64)
        };

        // A vanished blob fails the build before any byte is transmitted.
        await Assert.ThrowsAsync<SmtpNotSentException>(() =>
            sender.SendAsync(connection, draft, null, null, new[] { missing }, CancellationToken.None));
        Assert.Equal(0, transport.SendCount);
        
    }

    private static (MailboxConnection, MailDraft) Parts()
    {
        var connection = new MailboxConnection
        {
            Email = "mailbox@test.local",
            ImapHost = "imap.test.local",
            SmtpHost = "smtp.test.local",
            EncryptedCredentials = [1, 2, 3]
        };
        var draft = new MailDraft
        {
            MailboxConnectionId = connection.Id,
            ToAddrs = "receiver@test.local",
            Subject = "Hello",
            BodyText = "Body"
        };
        return (connection, draft);
    }

    private sealed class FakeEnv : IHostEnvironment
    {
        public FakeEnv(string contentRoot) => ContentRootPath = contentRoot;
        public string EnvironmentName { get; set; } = "Test";
        public string ApplicationName { get; set; } = "Tests";
        public string ContentRootPath { get; set; }
        public IFileProvider ContentRootFileProvider { get; set; } = new NullFileProvider();
    }
}
