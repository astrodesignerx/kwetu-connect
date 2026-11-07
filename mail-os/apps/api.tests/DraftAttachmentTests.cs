using System.Net;
using System.Net.Http.Json;
using Kompanion.Api.Data;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace Kompanion.Api.Tests;

/// <summary>
/// Drafts keep attachments, Bcc, reply headers and the brand opt-out through
/// autosave and resume; uploads bind to drafts; another draft's files cannot be
/// attached; and cross-org ids resolve to not found.
/// </summary>
public sealed class DraftAttachmentTests : IAsyncLifetime
{
    private FakeMailTestFactory _factory = null!;

    public async ValueTask InitializeAsync()
    {
        _factory = new FakeMailTestFactory();
        await _factory.InitializeAsync();
    }

    public async ValueTask DisposeAsync() => await _factory.DisposeAsync();

    private record DraftBody(
        Guid Id, Guid MailboxConnectionId,
        long? ReplyToMessageId, string? ReplyToAddress, string? References,
        string? ToAddrs, string? CcAddrs, string? BccAddrs,
        string? Subject, string? BodyText, string? BodyHtml,
        bool HasAttachments, string? AttachmentMetaJson,
        DateTimeOffset CreatedAt, DateTimeOffset UpdatedAt,
        Guid? ReplyToThreadId, bool SkipBrandWrap, string? InReplyTo,
        List<AttachmentBody> Attachments, LastSendBody? LastSend, uint RowVersion);
    private record AttachmentBody(Guid Id, string FileName, string? ContentType, long SizeBytes, bool IsInline, string? ContentId);
    private record LastSendBody(string Key, string Status);

    [Fact]
    public async Task Draft_preserves_attachments_bcc_reply_headers_and_brand_opt_out()
    {
        var admin = await ApiFixture.RegisterAdminAsync(_factory);
        var (connectionId, threadId, _) = await ApiFixture.SeedThreadAsync(_factory, admin.UserId);
        string threadMessageId;
        await using (var seedDb = _factory.NewDbContext())
            threadMessageId = (await seedDb.MailMessages.FirstAsync(m => m.ThreadId == threadId)).MessageId!;

        var upload = await UploadAsync(admin.Client, "hello.txt", "hello-bytes");
        var draftId = Guid.NewGuid();
        var upsert = await admin.Client.PostAsJsonAsync("/api/mail/drafts", new Dictionary<string, object?>
        {
            ["id"] = draftId,
            ["mailboxConnectionId"] = connectionId,
            ["replyToMessageId"] = null,
            ["replyToAddress"] = null,
            ["references"] = null,
            ["toAddrs"] = "receiver@test.local",
            ["ccAddrs"] = null,
            ["bccAddrs"] = "hidden@test.local",
            ["subject"] = "Subject",
            ["bodyText"] = "Body",
            ["bodyHtml"] = null,
            ["hasAttachments"] = false,
            ["attachmentMetaJson"] = null,
            ["replyToThreadId"] = threadId,
            ["skipBrandWrap"] = true,
            ["attachmentIds"] = new[] { upload }
        });
        upsert.EnsureSuccessStatusCode();

        var fetched = await admin.Client.GetFromJsonAsync<DraftBody>($"/api/mail/drafts/{draftId}");
        Assert.NotNull(fetched);
        Assert.Equal("hidden@test.local", fetched.BccAddrs);
        Assert.Equal(threadId, fetched.ReplyToThreadId);
        Assert.True(fetched.SkipBrandWrap);
        Assert.Equal(threadMessageId, fetched.InReplyTo);
        Assert.True(fetched.HasAttachments);
        Assert.Single(fetched.Attachments);
        Assert.Equal(upload, fetched.Attachments.Single().Id);

        // The server derives attachment state: client claims are ignored.
        await using var db = _factory.NewDbContext();
        var row = await db.MailDrafts.SingleAsync(d => d.Id == draftId);
        Assert.True(row.HasAttachments);
        Assert.NotNull(row.AttachmentMetaJson);
    }

    [Fact]
    public async Task Send_consumes_draft_bound_attachments_and_rejects_other_drafts_files()
    {
        var admin = await ApiFixture.RegisterAdminAsync(_factory);
        var (connectionId, _, _) = await ApiFixture.SeedThreadAsync(_factory, admin.UserId);

        var mine = await UploadAsync(admin.Client, "mine.txt", "mine");
        var draftId = Guid.NewGuid();
        (await admin.Client.PostAsJsonAsync("/api/mail/drafts", DraftWithAttachment(connectionId, draftId, mine)))
            .EnsureSuccessStatusCode();

        var otherFile = await UploadAsync(admin.Client, "other.txt", "other");
        var otherDraftId = Guid.NewGuid();
        (await admin.Client.PostAsJsonAsync("/api/mail/drafts", DraftWithAttachment(connectionId, otherDraftId, otherFile)))
            .EnsureSuccessStatusCode();

        // Another draft's upload cannot be attached through this draft's send.
        var rejected = await admin.Client.PostAsJsonAsync("/api/mail/send", SendPayload(connectionId, draftId, new[] { otherFile }));
        Assert.Equal(HttpStatusCode.NotFound, rejected.StatusCode);

        // The draft-bound file sends without explicit ids and is consumed.
        var sent = await admin.Client.PostAsJsonAsync("/api/mail/send", SendPayload(connectionId, draftId, Array.Empty<Guid>()));
        sent.EnsureSuccessStatusCode();
        var delivered = _factory.Smtp.Sent.Last();
        Assert.Contains(delivered.Attachments.OfType<MimeKit.MimePart>(), p => p.FileName == "mine.txt");

        await using var db = _factory.NewDbContext();
        Assert.False(await db.MailDrafts.AnyAsync(d => d.Id == draftId));
        Assert.False(await db.MailAttachments.AnyAsync(a => a.Id == mine));
    }

    [Fact]
    public async Task Cross_org_draft_attachment_and_send_ids_are_not_found()
    {
        var admin = await ApiFixture.RegisterAdminAsync(_factory);
        var (connectionId, _, _) = await ApiFixture.SeedThreadAsync(_factory, admin.UserId);
        var upload = await UploadAsync(admin.Client, "secret.txt", "secret");
        var draftId = Guid.NewGuid();
        (await admin.Client.PostAsJsonAsync("/api/mail/drafts", DraftWithAttachment(connectionId, draftId, upload)))
            .EnsureSuccessStatusCode();

        var outsider = await RegisterOtherOrgAsync("outsider@test.local");

        Assert.Equal(HttpStatusCode.NotFound,
            (await outsider.Client.GetAsync($"/api/mail/drafts/{draftId}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound,
            (await outsider.Client.GetAsync($"/api/mail/attachments/{upload}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound,
            (await outsider.Client.PostAsJsonAsync("/api/mail/send", SendPayload(connectionId, null, new[] { upload }))).StatusCode);
    }

    private static Dictionary<string, object?> DraftWithAttachment(Guid connectionId, Guid draftId, Guid attachmentId) =>
        new()
        {
            ["id"] = draftId,
            ["mailboxConnectionId"] = connectionId,
            ["replyToMessageId"] = null,
            ["replyToAddress"] = null,
            ["references"] = null,
            ["toAddrs"] = "receiver@test.local",
            ["ccAddrs"] = null,
            ["bccAddrs"] = null,
            ["subject"] = "With file",
            ["bodyText"] = "See attached",
            ["bodyHtml"] = null,
            ["hasAttachments"] = false,
            ["attachmentMetaJson"] = null,
            ["replyToThreadId"] = null,
            ["skipBrandWrap"] = false,
            ["attachmentIds"] = new[] { attachmentId }
        };

    private static Dictionary<string, object?> SendPayload(Guid connectionId, Guid? draftId, Guid[] attachmentIds, string? key = null) =>
        new()
        {
            ["mailboxConnectionId"] = connectionId,
            ["draftId"] = draftId,
            ["replyToThreadId"] = null,
            ["toAddrs"] = "receiver@test.local",
            ["ccAddrs"] = null,
            ["bccAddrs"] = null,
            ["subject"] = "Send",
            ["bodyText"] = "Body",
            ["bodyHtml"] = null,
            ["attachmentIds"] = attachmentIds,
            ["skipBrandWrap"] = false,
            ["idempotencyKey"] = key ?? $"draft-{Guid.NewGuid():N}"
        };

    private static async Task<Guid> UploadAsync(HttpClient client, string fileName, string content)
    {
        using var form = new MultipartFormDataContent();
        var bytes = new ByteArrayContent(System.Text.Encoding.UTF8.GetBytes(content));
        form.Add(bytes, "file", fileName);
        var res = await client.PostAsync("/api/mail/attachments", form);
        res.EnsureSuccessStatusCode();
        var body = (await res.Content.ReadFromJsonAsync<AttachmentBody>())!;
        return body.Id;
    }

    private static Dictionary<string, object?> DraftWithId(Guid connectionId, Guid draftId) =>
        new()
        {
            ["id"] = draftId,
            ["mailboxConnectionId"] = connectionId,
            ["replyToMessageId"] = null,
            ["replyToAddress"] = null,
            ["references"] = null,
            ["toAddrs"] = "receiver@test.local",
            ["ccAddrs"] = null,
            ["bccAddrs"] = null,
            ["subject"] = "Subject",
            ["bodyText"] = "Body",
            ["bodyHtml"] = null,
            ["hasAttachments"] = false,
            ["attachmentMetaJson"] = null,
            ["replyToThreadId"] = null,
            ["skipBrandWrap"] = false,
            ["attachmentIds"] = Array.Empty<Guid>()
        };

    [Fact]
    public async Task Sent_draft_cannot_be_resurrected_by_delayed_save()
    {
        var admin = await ApiFixture.RegisterAdminAsync(_factory);
        var (connectionId, _, _) = await ApiFixture.SeedThreadAsync(_factory, admin.UserId);
        var draftId = Guid.NewGuid();
        (await admin.Client.PostAsJsonAsync("/api/mail/drafts", DraftWithId(connectionId, draftId)))
            .EnsureSuccessStatusCode();

        var send = await admin.Client.PostAsJsonAsync("/api/mail/send", SendPayload(connectionId, draftId, Array.Empty<Guid>()));
        send.EnsureSuccessStatusCode();

        // A delayed autosave racing the send lands after the tombstone.
        var resurrect = await admin.Client.PostAsJsonAsync("/api/mail/drafts", DraftWithId(connectionId, draftId));
        Assert.Equal(HttpStatusCode.Conflict, resurrect.StatusCode);
        var code = (await resurrect.Content.ReadFromJsonAsync<ErrorCode>())!.Code;
        Assert.Equal("draft_gone", code);

        await using var db = _factory.NewDbContext();
        Assert.False(await db.MailDrafts.AnyAsync(d => d.Id == draftId));
    }

    [Fact]
    public async Task Discarded_draft_cannot_be_resurrected()
    {
        var admin = await ApiFixture.RegisterAdminAsync(_factory);
        var (connectionId, _, _) = await ApiFixture.SeedThreadAsync(_factory, admin.UserId);
        var draftId = Guid.NewGuid();
        (await admin.Client.PostAsJsonAsync("/api/mail/drafts", DraftWithId(connectionId, draftId)))
            .EnsureSuccessStatusCode();
        (await admin.Client.DeleteAsync($"/api/mail/drafts/{draftId}")).EnsureSuccessStatusCode();

        var resurrect = await admin.Client.PostAsJsonAsync("/api/mail/drafts", DraftWithId(connectionId, draftId));
        Assert.Equal(HttpStatusCode.Conflict, resurrect.StatusCode);
    }

    [Fact]
    public async Task Cross_connection_id_collision_is_rejected_without_touching_the_original()
    {
        var admin = await ApiFixture.RegisterAdminAsync(_factory);
        var (connectionA, _, _) = await ApiFixture.SeedThreadAsync(_factory, admin.UserId);
        var (connectionB, _, _) = await ApiFixture.SeedThreadAsync(_factory, admin.UserId);
        var draftId = Guid.NewGuid();
        (await admin.Client.PostAsJsonAsync("/api/mail/drafts", DraftWithId(connectionA, draftId)))
            .EnsureSuccessStatusCode();

        // Same id under another connection: not a fork, a conflict.
        var collision = await admin.Client.PostAsJsonAsync("/api/mail/drafts", DraftWithId(connectionB, draftId));
        Assert.Equal(HttpStatusCode.Conflict, collision.StatusCode);

        await using var db = _factory.NewDbContext();
        Assert.Equal(connectionA,
            (await db.MailDrafts.SingleAsync(d => d.Id == draftId)).MailboxConnectionId);
    }

    [Fact]
    public async Task Rejected_upload_leaves_no_draft_changes()
    {
        var admin = await ApiFixture.RegisterAdminAsync(_factory);
        var (connectionId, _, _) = await ApiFixture.SeedThreadAsync(_factory, admin.UserId);
        var draftId = Guid.NewGuid();
        (await admin.Client.PostAsJsonAsync("/api/mail/drafts", DraftWithId(connectionId, draftId)))
            .EnsureSuccessStatusCode();

        var bad = DraftWithId(connectionId, draftId);
        bad["subject"] = "Changed";
        bad["attachmentIds"] = new[] { Guid.NewGuid() };
        var res = await admin.Client.PostAsJsonAsync("/api/mail/drafts", bad);
        Assert.Equal(HttpStatusCode.NotFound, res.StatusCode);

        await using var db = _factory.NewDbContext();
        var row = await db.MailDrafts.SingleAsync(d => d.Id == draftId);
        Assert.Equal("Subject", row.Subject);
        Assert.False(row.HasAttachments);
    }

    [Fact]
    public async Task Teammate_can_save_send_and_remove_a_shared_attachment()
    {
        var admin = await ApiFixture.RegisterAdminAsync(_factory);
        var member = await ApiFixture.InviteAndRegisterAsync(_factory, admin, "teammate@test.local");
        var (connectionId, _, _) = await ApiFixture.SeedThreadAsync(_factory, admin.UserId);

        var file = await UploadAsync(admin.Client, "shared.txt", "shared-bytes");
        var draftId = Guid.NewGuid();
        var create = DraftWithAttachment(connectionId, draftId, file);
        (await admin.Client.PostAsJsonAsync("/api/mail/drafts", create)).EnsureSuccessStatusCode();

        // A different member autosaves the same shared draft, keeping its file.
        var teammateSave = DraftWithId(connectionId, draftId);
        teammateSave["bccAddrs"] = "teammate-copy@test.local";
        teammateSave["attachmentIds"] = new[] { file };
        var saved = await member.Client.PostAsJsonAsync("/api/mail/drafts", teammateSave);
        saved.EnsureSuccessStatusCode();
        var savedBody = (await saved.Content.ReadFromJsonAsync<DraftBody>())!;
        Assert.Equal("teammate-copy@test.local", savedBody.BccAddrs);
        Assert.Single(savedBody.Attachments);

        // The teammate sends the shared draft with its attachment.
        var sent = await member.Client.PostAsJsonAsync("/api/mail/send", SendPayload(connectionId, draftId, Array.Empty<Guid>()));
        sent.EnsureSuccessStatusCode();
        var delivered = _factory.Smtp.Sent.Last();
        Assert.Contains(delivered.Attachments.OfType<MimeKit.MimePart>(), p => p.FileName == "shared.txt");

        // And removes a file from a draft they can edit: re-create both first.
        var file2 = await UploadAsync(admin.Client, "shared2.txt", "more-bytes");
        var draft2 = Guid.NewGuid();
        (await admin.Client.PostAsJsonAsync("/api/mail/drafts", DraftWithAttachment(connectionId, draft2, file2)))
            .EnsureSuccessStatusCode();
        (await member.Client.DeleteAsync($"/api/mail/attachments/{file2}")).EnsureSuccessStatusCode();
        await using var db = _factory.NewDbContext();
        Assert.False(await db.MailAttachments.AnyAsync(a => a.Id == file2));
    }

    private record ErrorCode(string? Error, string? Code);

    [Fact]
    public async Task Stale_version_rejected_without_changes()
    {
        var admin = await ApiFixture.RegisterAdminAsync(_factory);
        var (connectionId, _, _) = await ApiFixture.SeedThreadAsync(_factory, admin.UserId);
        var draftId = Guid.NewGuid();
        var saved = await admin.Client.PostAsJsonAsync("/api/mail/drafts", DraftWithId(connectionId, draftId));
        saved.EnsureSuccessStatusCode();
        var version = (await saved.Content.ReadFromJsonAsync<DraftBody>())!.RowVersion;

        // A teammate's edit lands first and bumps the version.
        var teammate = DraftWithId(connectionId, draftId);
        teammate["subject"] = "Teammate subject";
        teammate["expectedVersion"] = version;
        (await admin.Client.PostAsJsonAsync("/api/mail/drafts", teammate)).EnsureSuccessStatusCode();

        // The stale write is rejected; nothing is overwritten.
        var stale = DraftWithId(connectionId, draftId);
        stale["subject"] = "Stale subject";
        stale["expectedVersion"] = version;
        var res = await admin.Client.PostAsJsonAsync("/api/mail/drafts", stale);
        Assert.Equal(HttpStatusCode.Conflict, res.StatusCode);
        Assert.Equal("draft_conflict", (await res.Content.ReadFromJsonAsync<ErrorCode>())!.Code);

        await using var db = _factory.NewDbContext();
        Assert.Equal("Teammate subject", (await db.MailDrafts.SingleAsync(d => d.Id == draftId)).Subject);
    }

    [Fact]
    public async Task Concurrent_save_and_discard_stays_consistent()
    {
        var admin = await ApiFixture.RegisterAdminAsync(_factory);
        var (connectionId, _, _) = await ApiFixture.SeedThreadAsync(_factory, admin.UserId);
        var draftId = Guid.NewGuid();
        (await admin.Client.PostAsJsonAsync("/api/mail/drafts", DraftWithId(connectionId, draftId)))
            .EnsureSuccessStatusCode();

        // Hold the per-draft lock externally so the save and the discard genuinely
        // race; whichever order they run in, the end state must be consistent.
        await using var db = _factory.NewDbContext();
        await using var tx = await db.Database.BeginTransactionAsync();
        await db.Database.ExecuteSqlRawAsync($"SELECT pg_advisory_xact_lock(hashtext('{draftId}'))");
        var save = admin.Client.PostAsJsonAsync("/api/mail/drafts", DraftWithId(connectionId, draftId));
        var discard = admin.Client.DeleteAsync($"/api/mail/drafts/{draftId}");
        await Task.Delay(500);
        await tx.RollbackAsync();
        await Task.WhenAll(save, discard);

        await using var check = _factory.NewDbContext();
        // Either order ends consistent: no live row survives alongside a
        // tombstone, and a lost save never resurrects a discarded draft.
        Assert.False(await check.MailDrafts.AnyAsync(d => d.Id == draftId));
        Assert.True(await check.DraftTombstones.AnyAsync(t => t.DraftId == draftId));
    }

    [Fact]
    public async Task Failed_send_intent_is_visible_on_the_draft()
    {
        var admin = await ApiFixture.RegisterAdminAsync(_factory);
        var (connectionId, _, _) = await ApiFixture.SeedThreadAsync(_factory, admin.UserId);
        var draftId = Guid.NewGuid();
        (await admin.Client.PostAsJsonAsync("/api/mail/drafts", DraftWithId(connectionId, draftId)))
            .EnsureSuccessStatusCode();

        var key = $"intent-{Guid.NewGuid():N}";
        _factory.Smtp.OnSend = _ => new Kompanion.Api.Services.Mail.SmtpNotSentException("Down.");
        try
        {
            var failed = await admin.Client.PostAsJsonAsync("/api/mail/send", SendPayload(connectionId, draftId, Array.Empty<Guid>(), key));
            Assert.Equal(HttpStatusCode.BadGateway, failed.StatusCode);
        }
        finally
        {
            _factory.Smtp.OnSend = null;
        }

        var fetched = await admin.Client.GetFromJsonAsync<DraftBody>($"/api/mail/drafts/{draftId}");
        Assert.NotNull(fetched!.LastSend);
        Assert.Equal(key, fetched.LastSend.Key);
        Assert.Equal("Failed", fetched.LastSend.Status);
    }

    [Fact]
    public async Task Save_during_transport_does_not_leave_an_accepted_draft()
    {
        var admin = await ApiFixture.RegisterAdminAsync(_factory);
        var (connectionId, _, _) = await ApiFixture.SeedThreadAsync(_factory, admin.UserId);
        var draftId = Guid.NewGuid();
        (await admin.Client.PostAsJsonAsync("/api/mail/drafts", DraftWithId(connectionId, draftId)))
            .EnsureSuccessStatusCode();
        _factory.Smtp.OnSend = _ =>
        {
            using var editing = _factory.NewDbContext();
            var draft = editing.MailDrafts.Single(d => d.Id == draftId);
            draft.Subject = "Saved while SMTP was active";
            editing.SaveChanges();
            return null;
        };
        try
        {
            (await admin.Client.PostAsJsonAsync("/api/mail/send",
                SendPayload(connectionId, draftId, Array.Empty<Guid>())))
                .EnsureSuccessStatusCode();
            await using var check = _factory.NewDbContext();
            Assert.False(await check.MailDrafts.AnyAsync(d => d.Id == draftId));
            Assert.True(await check.DraftTombstones.AnyAsync(t => t.DraftId == draftId));
        }
        finally
        {
            _factory.Smtp.OnSend = null;
        }
    }

    private async Task<ApiFixture.Session> RegisterOtherOrgAsync(string email)
    {
        await using (var db = _factory.NewDbContext())
        {
            var org = new Organization { Name = "Other Org" };
            db.Organizations.Add(org);
            await db.SaveChangesAsync();
            var user = new User
            {
                OrganizationId = org.Id,
                Email = email,
                Username = email.Split('@')[0],
                DisplayName = "Outsider",
                PasswordHash = ""
            };
            user.PasswordHash = new PasswordHasher<User>().HashPassword(user, "another good password");
            db.Users.Add(user);
            await db.SaveChangesAsync();
        }
        return await ApiFixture.LoginAsync(_factory, email, "another good password");
    }
}
