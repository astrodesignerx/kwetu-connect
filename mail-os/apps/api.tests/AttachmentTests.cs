using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text;
using Kompanion.Api.Data;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace Kompanion.Api.Tests;

/// <summary>
/// Attachments used to be metadata-only — no way to open a received file or send one.
/// These cover the round trip and the scoping rules on the download endpoint.
/// </summary>
public class AttachmentTests : IAsyncLifetime
{
    private TestAppFactory _factory = null!;

    public async ValueTask InitializeAsync()
    {
        _factory = new TestAppFactory();
        await _factory.InitializeAsync();
    }

    public async ValueTask DisposeAsync() => await _factory.DisposeAsync();

    private static MultipartFormDataContent FileContent(string name, string body)
    {
        var content = new ByteArrayContent(Encoding.UTF8.GetBytes(body));
        content.Headers.ContentType = new MediaTypeHeaderValue("text/plain");
        return new MultipartFormDataContent { { content, "file", name } };
    }

    [Fact]
    public async Task Uploaded_file_can_be_downloaded_back_byte_for_byte()
    {
        var admin = await ApiFixture.RegisterAdminAsync(_factory);
        const string payload = "Quarterly report, final version.";

        var upload = await admin.Client.PostAsync("/api/mail/attachments", FileContent("report.txt", payload));
        upload.EnsureSuccessStatusCode();
        var attachment = await upload.Content.ReadFromJsonAsync<AttachmentBody>();

        Assert.Equal("report.txt", attachment!.FileName);
        Assert.Equal(payload.Length, attachment.SizeBytes);

        var download = await admin.Client.GetAsync($"/api/mail/attachments/{attachment.Id}");
        download.EnsureSuccessStatusCode();
        Assert.Equal(payload, await download.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task Identical_content_is_stored_once()
    {
        var admin = await ApiFixture.RegisterAdminAsync(_factory);
        const string payload = "The very same bytes.";

        var first = await admin.Client.PostAsync("/api/mail/attachments", FileContent("a.txt", payload));
        var second = await admin.Client.PostAsync("/api/mail/attachments", FileContent("b.txt", payload));
        first.EnsureSuccessStatusCode();
        second.EnsureSuccessStatusCode();

        var a = await first.Content.ReadFromJsonAsync<AttachmentBody>();
        var b = await second.Content.ReadFromJsonAsync<AttachmentBody>();
        Assert.NotEqual(a!.Id, b!.Id);

        await using var db = _factory.NewDbContext();
        var keys = await db.MailAttachments
            .Where(x => x.Id == a.Id || x.Id == b.Id)
            .Select(x => x.BlobKey)
            .ToListAsync();

        // Two rows, one blob — the store is content-addressed.
        Assert.Equal(2, keys.Count);
        Assert.Single(keys.Distinct());
    }

    [Fact]
    public async Task Another_users_staged_upload_is_not_downloadable()
    {
        var admin = await ApiFixture.RegisterAdminAsync(_factory);
        var member = await ApiFixture.InviteAndRegisterAsync(_factory, admin, "member@test.local");

        var upload = await admin.Client.PostAsync("/api/mail/attachments", FileContent("private.txt", "draft only"));
        upload.EnsureSuccessStatusCode();
        var attachment = await upload.Content.ReadFromJsonAsync<AttachmentBody>();

        // A staged upload belongs to whoever is composing; it is not org-shared until sent.
        var res = await member.Client.GetAsync($"/api/mail/attachments/{attachment!.Id}");
        Assert.Equal(HttpStatusCode.NotFound, res.StatusCode);
    }

    [Fact]
    public async Task Attachment_on_an_org_message_is_readable_by_any_member()
    {
        var admin = await ApiFixture.RegisterAdminAsync(_factory);
        var member = await ApiFixture.InviteAndRegisterAsync(_factory, admin, "member@test.local");
        var (_, _, messageId) = await ApiFixture.SeedThreadAsync(_factory, admin.UserId);

        var (blobKey, _) = await _factory.AttachmentStore.SaveAsync(
            new MemoryStream(Encoding.UTF8.GetBytes("shared inbox content")), CancellationToken.None);

        Guid attachmentId;
        await using (var db = _factory.NewDbContext())
        {
            var row = new MailAttachment
            {
                MessageId = messageId,
                FileName = "shared.txt",
                ContentType = "text/plain",
                SizeBytes = 20,
                BlobKey = blobKey
            };
            db.MailAttachments.Add(row);
            await db.SaveChangesAsync();
            attachmentId = row.Id;
        }

        // Phase 7 shared inbox: a colleague reads the mailbox, so they read its files.
        var res = await member.Client.GetAsync($"/api/mail/attachments/{attachmentId}");
        res.EnsureSuccessStatusCode();
        Assert.Equal("shared inbox content", await res.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task Unknown_attachment_id_is_not_found()
    {
        var admin = await ApiFixture.RegisterAdminAsync(_factory);
        var res = await admin.Client.GetAsync($"/api/mail/attachments/{Guid.NewGuid()}");
        Assert.Equal(HttpStatusCode.NotFound, res.StatusCode);
    }

    [Fact]
    public async Task Unauthenticated_download_is_rejected()
    {
        await ApiFixture.RegisterAdminAsync(_factory);
        var anonymous = _factory.CreateClient();

        var res = await anonymous.GetAsync($"/api/mail/attachments/{Guid.NewGuid()}");
        Assert.Equal(HttpStatusCode.Unauthorized, res.StatusCode);
    }

    [Fact]
    public async Task Empty_upload_is_rejected()
    {
        var admin = await ApiFixture.RegisterAdminAsync(_factory);
        var res = await admin.Client.PostAsync("/api/mail/attachments", FileContent("empty.txt", ""));
        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
    }

    [Fact]
    public async Task Sending_with_an_attachment_the_caller_does_not_own_is_rejected()
    {
        var admin = await ApiFixture.RegisterAdminAsync(_factory);
        var member = await ApiFixture.InviteAndRegisterAsync(_factory, admin, "member@test.local");
        var (connectionId, _, _) = await ApiFixture.SeedThreadAsync(_factory, member.UserId);

        var upload = await admin.Client.PostAsync("/api/mail/attachments", FileContent("admin.txt", "admin's file"));
        upload.EnsureSuccessStatusCode();
        var attachment = await upload.Content.ReadFromJsonAsync<AttachmentBody>();

        // Guessing another user's attachment id must not exfiltrate their file by mail.
        var send = await member.Client.PostAsJsonAsync("/api/mail/send", new
        {
            mailboxConnectionId = connectionId,
            toAddrs = "someone@example.com",
            subject = "Nice try",
            bodyText = "…",
            attachmentIds = new[] { attachment!.Id },
            idempotencyKey = $"attach-scope-{Guid.NewGuid():N}"
        });

        Assert.Equal(HttpStatusCode.NotFound, send.StatusCode);
    }

    [Fact]
    public async Task Filenames_with_path_separators_are_sanitized()
    {
        // MailIngestor sanitizes sender-supplied names before they reach a
        // Content-Disposition header or the filesystem.
        Assert.Equal("passwd", Services.Mail.MailIngestor.SanitizeFileName("../../etc/passwd"));
        Assert.Equal("report.pdf", Services.Mail.MailIngestor.SanitizeFileName("C:\\temp\\report.pdf"));
        Assert.Equal("attachment", Services.Mail.MailIngestor.SanitizeFileName("   "));
        Assert.DoesNotContain("\"", Services.Mail.MailIngestor.SanitizeFileName("in\"jected.txt"));
    }

    private record AttachmentBody(Guid Id, string FileName, string? ContentType, long SizeBytes);
}
