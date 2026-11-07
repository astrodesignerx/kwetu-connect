using System.Net;
using System.Net.Http.Json;
using Kompanion.Api.Data;
using Kompanion.Api.Services.Mail;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace Kompanion.Api.Tests;

/// <summary>
/// Durable send operations: safe retry, concurrent duplicates, uncertain outcomes
/// that never resend, acceptance replay, key-reuse rejection, and housekeeping
/// failures that must not fail an accepted send.
/// </summary>
public sealed class SendOperationTests : IAsyncLifetime
{
    private FakeMailTestFactory _factory = null!;

    public async ValueTask InitializeAsync()
    {
        _factory = new FakeMailTestFactory();
        await _factory.InitializeAsync();
    }

    public async ValueTask DisposeAsync() => await _factory.DisposeAsync();

    private static object Payload(Guid connectionId, string key, string subject = "Hello") => new
    {
        mailboxConnectionId = connectionId,
        draftId = (Guid?)null,
        replyToThreadId = (Guid?)null,
        toAddrs = "receiver@test.local",
        ccAddrs = (string?)null,
        bccAddrs = (string?)null,
        subject,
        bodyText = "Body text",
        bodyHtml = (string?)null,
        attachmentIds = Array.Empty<Guid>(),
        skipBrandWrap = false,
        idempotencyKey = key
    };

    private record SendBody(string MessageId, bool Deduplicated);

    [Fact]
    public async Task Safe_retry_after_pre_delivery_failure_sends_once()
    {
        var admin = await ApiFixture.RegisterAdminAsync(_factory);
        var (connectionId, _, _) = await ApiFixture.SeedThreadAsync(_factory, admin.UserId);
        var key = $"safe-retry-{Guid.NewGuid():N}";
        var before = _factory.Smtp.SendCount;

        // Unknown attachment: pre-delivery failure, no operation claimed.
        var badRes = await admin.Client.PostAsJsonAsync("/api/mail/send", new Dictionary<string, object?>
        {
            ["mailboxConnectionId"] = connectionId,
            ["draftId"] = null,
            ["replyToThreadId"] = null,
            ["toAddrs"] = "receiver@test.local",
            ["ccAddrs"] = null,
            ["bccAddrs"] = null,
            ["subject"] = "Hello",
            ["bodyText"] = "Body text",
            ["bodyHtml"] = null,
            ["attachmentIds"] = new[] { Guid.NewGuid() },
            ["skipBrandWrap"] = false,
            ["idempotencyKey"] = key
        });
        Assert.Equal(HttpStatusCode.NotFound, badRes.StatusCode);

        var good = await admin.Client.PostAsJsonAsync("/api/mail/send", Payload(connectionId, key));
        good.EnsureSuccessStatusCode();
        Assert.Equal(before + 1, _factory.Smtp.SendCount);
    }

    [Fact]
    public async Task Concurrent_duplicates_deliver_once_and_share_the_result()
    {
        var admin = await ApiFixture.RegisterAdminAsync(_factory);
        var (connectionId, _, _) = await ApiFixture.SeedThreadAsync(_factory, admin.UserId);
        var key = $"concurrent-{Guid.NewGuid():N}";
        var before = _factory.Smtp.SendCount;

        var tasks = Enumerable.Range(0, 8).Select(_ =>
        {
            var client = ApiFixture.ClientWithToken(_factory, admin.Token);
            return client.PostAsJsonAsync("/api/mail/send", Payload(connectionId, key));
        }).ToList();
        var responses = await Task.WhenAll(tasks);

        Assert.All(responses, r => Assert.Equal(HttpStatusCode.OK, r.StatusCode));
        var bodies = new List<SendBody>();
        foreach (var r in responses)
            bodies.Add((await r.Content.ReadFromJsonAsync<SendBody>())!);
        Assert.Single(bodies.Select(b => b.MessageId).Distinct());
        Assert.Equal(before + 1, _factory.Smtp.SendCount);
    }

    [Fact]
    public async Task Uncertain_outcome_cannot_resend()
    {
        var admin = await ApiFixture.RegisterAdminAsync(_factory);
        var (connectionId, _, _) = await ApiFixture.SeedThreadAsync(_factory, admin.UserId);
        var key = $"uncertain-{Guid.NewGuid():N}";
        _factory.Smtp.OnSend = _ => new IOException("Simulated connection drop mid-send.");
        try
        {
            var first = await admin.Client.PostAsJsonAsync("/api/mail/send", Payload(connectionId, key));
            Assert.Equal(HttpStatusCode.BadGateway, first.StatusCode);
            var before = _factory.Smtp.SendCount;

            var retry = await admin.Client.PostAsJsonAsync("/api/mail/send", Payload(connectionId, key));
            Assert.Equal(HttpStatusCode.BadGateway, retry.StatusCode);
            Assert.Equal(before, _factory.Smtp.SendCount);

            await using var db = _factory.NewDbContext();
            var op = await db.SendOperations.SingleAsync(o => o.RequestKey == key);
            Assert.Equal(SendOperationStatus.Uncertain, op.Status);
        }
        finally
        {
            _factory.Smtp.OnSend = null;
        }
    }

    [Fact]
    public async Task Accepted_send_replays_without_another_delivery()
    {
        var admin = await ApiFixture.RegisterAdminAsync(_factory);
        var (connectionId, _, _) = await ApiFixture.SeedThreadAsync(_factory, admin.UserId);
        var key = $"replay-{Guid.NewGuid():N}";

        var first = await admin.Client.PostAsJsonAsync("/api/mail/send", Payload(connectionId, key));
        first.EnsureSuccessStatusCode();
        var firstBody = (await first.Content.ReadFromJsonAsync<SendBody>())!;
        Assert.False(firstBody.Deduplicated);
        var before = _factory.Smtp.SendCount;

        var retry = await admin.Client.PostAsJsonAsync("/api/mail/send", Payload(connectionId, key));
        retry.EnsureSuccessStatusCode();
        var retryBody = (await retry.Content.ReadFromJsonAsync<SendBody>())!;
        Assert.True(retryBody.Deduplicated);
        Assert.Equal(firstBody.MessageId, retryBody.MessageId);
        Assert.Equal(before, _factory.Smtp.SendCount);
    }

    [Fact]
    public async Task Key_reuse_with_changed_content_is_rejected()
    {
        var admin = await ApiFixture.RegisterAdminAsync(_factory);
        var (connectionId, _, _) = await ApiFixture.SeedThreadAsync(_factory, admin.UserId);
        var key = $"changed-{Guid.NewGuid():N}";

        (await admin.Client.PostAsJsonAsync("/api/mail/send", Payload(connectionId, key, "First"))).EnsureSuccessStatusCode();
        var before = _factory.Smtp.SendCount;

        var retry = await admin.Client.PostAsJsonAsync("/api/mail/send", Payload(connectionId, key, "Changed"));
        Assert.Equal(HttpStatusCode.Conflict, retry.StatusCode);
        Assert.Equal("already_sent", (await retry.Content.ReadFromJsonAsync<ErrorBody>())!.Code);
        Assert.Equal(before, _factory.Smtp.SendCount);
    }

    [Fact]
    public async Task Missing_key_is_rejected()
    {
        var admin = await ApiFixture.RegisterAdminAsync(_factory);
        var (connectionId, _, _) = await ApiFixture.SeedThreadAsync(_factory, admin.UserId);

        var res = await admin.Client.PostAsJsonAsync("/api/mail/send", new Dictionary<string, object?>
        {
            ["mailboxConnectionId"] = connectionId,
            ["draftId"] = null,
            ["replyToThreadId"] = null,
            ["toAddrs"] = "receiver@test.local",
            ["ccAddrs"] = null,
            ["bccAddrs"] = null,
            ["subject"] = "No key",
            ["bodyText"] = "Body",
            ["bodyHtml"] = null,
            ["attachmentIds"] = Array.Empty<Guid>(),
            ["skipBrandWrap"] = false
        });

        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
        Assert.Equal(0, _factory.Smtp.SendCount);
    }

    [Fact]
    public async Task Failed_changed_reports_failed_changed_and_original_still_retries()
    {
        var admin = await ApiFixture.RegisterAdminAsync(_factory);
        var (connectionId, _, _) = await ApiFixture.SeedThreadAsync(_factory, admin.UserId);
        var key = $"failed-changed-{Guid.NewGuid():N}";

        _factory.Smtp.OnSend = _ => new SmtpNotSentException("Simulated unreachable host.");
        try
        {
            var failed = await admin.Client.PostAsJsonAsync("/api/mail/send", Payload(connectionId, key));
            Assert.Equal(HttpStatusCode.BadGateway, failed.StatusCode);
        }
        finally
        {
            _factory.Smtp.OnSend = null;
        }

        var changed = await admin.Client.PostAsJsonAsync("/api/mail/send", Payload(connectionId, key, "Changed"));
        Assert.Equal(HttpStatusCode.Conflict, changed.StatusCode);
        Assert.Equal("failed_changed", (await changed.Content.ReadFromJsonAsync<ErrorBody>())!.Code);

        var retry = await admin.Client.PostAsJsonAsync("/api/mail/send", Payload(connectionId, key));
        retry.EnsureSuccessStatusCode();
    }

    [Fact]
    public async Task Waiting_peer_failure_delivers_exactly_once()
    {
        var admin = await ApiFixture.RegisterAdminAsync(_factory);
        var (connectionId, _, _) = await ApiFixture.SeedThreadAsync(_factory, admin.UserId);
        var key = $"peer-{Guid.NewGuid():N}";

        using var gate = new ManualResetEventSlim(false);
        var calls = 0;
        _factory.Smtp.OnSend = _ =>
        {
            if (Interlocked.Increment(ref calls) == 1)
            {
                gate.Wait(TimeSpan.FromSeconds(30));
                return new SmtpNotSentException("Released failure.");
            }
            return null;
        };
        try
        {
            var first = admin.Client.PostAsJsonAsync("/api/mail/send", Payload(connectionId, key));
            while (_factory.Smtp.SendCount == 0) await Task.Delay(50);
            var second = admin.Client.PostAsJsonAsync("/api/mail/send", Payload(connectionId, key));
            gate.Set();

            var firstRes = await first;
            var secondRes = await second;
            Assert.Equal(HttpStatusCode.BadGateway, firstRes.StatusCode);
            secondRes.EnsureSuccessStatusCode();
            var secondBody = (await secondRes.Content.ReadFromJsonAsync<SendBody>())!;
            Assert.Equal(
                _factory.Smtp.Sent.Last().MessageId,
                secondBody.MessageId);
            Assert.Equal(2, _factory.Smtp.SendCount);
            await using var db = _factory.NewDbContext();
            Assert.Equal(SendOperationStatus.Accepted,
                (await db.SendOperations.SingleAsync(o => o.RequestKey == key)).Status);
        }
        finally
        {
            _factory.Smtp.OnSend = null;
        }
    }

    [Fact]
    public async Task Waiting_timeout_reports_in_progress_without_delivery()
    {
        var admin = await ApiFixture.RegisterAdminAsync(_factory);
        var (connectionId, _, _) = await ApiFixture.SeedThreadAsync(_factory, admin.UserId);
        var key = $"timeout-{Guid.NewGuid():N}";

        // A fresh Sending row with no peer behind it: the waiter must time out
        // honestly instead of delivering or failing.
        await using (var db = _factory.NewDbContext())
        {
            db.SendOperations.Add(new SendOperation
            {
                CallerUserId = admin.UserId,
                MailboxConnectionId = connectionId,
                RequestKey = key,
                PayloadHash = StaleFingerprint(),
                WireMessageId = "<timeout@test.local>",
                Status = SendOperationStatus.Sending,
                CreatedAt = DateTimeOffset.UtcNow,
                UpdatedAt = DateTimeOffset.UtcNow
            });
            await db.SaveChangesAsync();
        }
        var before = _factory.Smtp.SendCount;

        var waiting = await admin.Client.PostAsJsonAsync("/api/mail/send", StalePayload(connectionId, key));
        Assert.Equal(HttpStatusCode.Conflict, waiting.StatusCode);
        Assert.Equal("in_progress", (await waiting.Content.ReadFromJsonAsync<ErrorBody>())!.Code);
        Assert.Equal(before, _factory.Smtp.SendCount);
        await using (var db = _factory.NewDbContext())
            Assert.Equal(SendOperationStatus.Sending,
                (await db.SendOperations.SingleAsync(o => o.RequestKey == key)).Status);
    }

    [Fact]
    public async Task Filing_failure_after_acceptance_still_succeeds_and_consumes_the_draft()
    {
        var admin = await ApiFixture.RegisterAdminAsync(_factory);
        var (connectionId, _, _) = await ApiFixture.SeedThreadAsync(_factory, admin.UserId);
        var draftId = Guid.NewGuid();
        var draftRes = await admin.Client.PostAsJsonAsync("/api/mail/drafts", DraftPayload(connectionId, draftId));
        draftRes.EnsureSuccessStatusCode();

        _factory.Filer.ThrowOnFile = true;
        try
        {
            var res = await admin.Client.PostAsJsonAsync("/api/mail/send", new Dictionary<string, object?>
            {
                ["mailboxConnectionId"] = connectionId,
                ["draftId"] = draftId,
                ["replyToThreadId"] = null,
                ["toAddrs"] = "receiver@test.local",
                ["ccAddrs"] = null,
                ["bccAddrs"] = null,
                ["subject"] = "Filed?",
                ["bodyText"] = "Body",
                ["bodyHtml"] = null,
                ["attachmentIds"] = Array.Empty<Guid>(),
                ["skipBrandWrap"] = false,
                ["idempotencyKey"] = $"filing-{Guid.NewGuid():N}"
            });
            res.EnsureSuccessStatusCode();
        }
        finally
        {
            _factory.Filer.ThrowOnFile = false;
        }

        await using var db = _factory.NewDbContext();
        Assert.False(await db.MailDrafts.AnyAsync(d => d.Id == draftId));
    }

    [Fact]
    public async Task Wire_message_id_is_stable_and_returned()
    {
        var admin = await ApiFixture.RegisterAdminAsync(_factory);
        var (connectionId, _, _) = await ApiFixture.SeedThreadAsync(_factory, admin.UserId);

        var res = await admin.Client.PostAsJsonAsync("/api/mail/send", Payload(connectionId, $"wire-{Guid.NewGuid():N}"));
        res.EnsureSuccessStatusCode();
        var body = (await res.Content.ReadFromJsonAsync<SendBody>())!;

        Assert.Equal(body.MessageId, _factory.Smtp.Sent.Last().MessageId);
    }

    private static object DraftPayload(Guid connectionId, Guid draftId) => new
    {
        id = draftId,
        mailboxConnectionId = connectionId,
        replyToMessageId = (long?)null,
        replyToAddress = (string?)null,
        references = (string?)null,
        toAddrs = "receiver@test.local",
        ccAddrs = (string?)null,
        bccAddrs = (string?)null,
        subject = "Filed?",
        bodyText = "Body",
        bodyHtml = (string?)null,
        hasAttachments = false,
        attachmentMetaJson = (string?)null,
        replyToThreadId = (Guid?)null,
        skipBrandWrap = false,
        attachmentIds = Array.Empty<Guid>()
    };

    [Fact]
    public async Task Accepted_replay_after_cleanup_returns_original()
    {
        var admin = await ApiFixture.RegisterAdminAsync(_factory);
        var (connectionId, _, _) = await ApiFixture.SeedThreadAsync(_factory, admin.UserId);

        using var form = new MultipartFormDataContent();
        form.Add(new ByteArrayContent("file-bytes"u8.ToArray()), "file", "doc.txt");
        var upload = await admin.Client.PostAsync("/api/mail/attachments", form);
        upload.EnsureSuccessStatusCode();
        var attachmentId = (await upload.Content.ReadFromJsonAsync<AttachmentRef>())!.Id;

        var draftId = Guid.NewGuid();
        var draftRes = await admin.Client.PostAsJsonAsync("/api/mail/drafts", new Dictionary<string, object?>
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
        });
        draftRes.EnsureSuccessStatusCode();

        var key = $"cleanup-replay-{Guid.NewGuid():N}";
        Dictionary<string, object?> SendBody() => new()
        {
            ["mailboxConnectionId"] = connectionId,
            ["draftId"] = draftId,
            ["replyToThreadId"] = null,
            ["toAddrs"] = "receiver@test.local",
            ["ccAddrs"] = null,
            ["bccAddrs"] = null,
            ["subject"] = "With file",
            ["bodyText"] = "See attached",
            ["bodyHtml"] = null,
            ["attachmentIds"] = new[] { attachmentId },
            ["skipBrandWrap"] = false,
            ["idempotencyKey"] = key
        };

        var first = await admin.Client.PostAsJsonAsync("/api/mail/send", SendBody());
        first.EnsureSuccessStatusCode();
        var firstBody = (await first.Content.ReadFromJsonAsync<SendBody>())!;
        var before = _factory.Smtp.SendCount;

        // Draft and staged files are gone, but the identical retry replays.
        var retry = await admin.Client.PostAsJsonAsync("/api/mail/send", SendBody());
        retry.EnsureSuccessStatusCode();
        var retryBody = (await retry.Content.ReadFromJsonAsync<SendBody>())!;
        Assert.True(retryBody.Deduplicated);
        Assert.Equal(firstBody.MessageId, retryBody.MessageId);
        Assert.Equal(before, _factory.Smtp.SendCount);
    }

    [Fact]
    public async Task Replay_survives_changed_brand_and_reply_target()
    {
        var admin = await ApiFixture.RegisterAdminAsync(_factory);
        var (connectionId, threadId, _) = await ApiFixture.SeedThreadAsync(_factory, admin.UserId);
        var key = $"drift-{Guid.NewGuid():N}";
        Dictionary<string, object?> SendBody() => new()
        {
            ["mailboxConnectionId"] = connectionId,
            ["draftId"] = null,
            ["replyToThreadId"] = threadId,
            ["toAddrs"] = "receiver@test.local",
            ["ccAddrs"] = null,
            ["bccAddrs"] = null,
            ["subject"] = "Drift",
            ["bodyText"] = "Body",
            ["bodyHtml"] = "<p>Body</p>",
            ["attachmentIds"] = Array.Empty<Guid>(),
            ["skipBrandWrap"] = false,
            ["idempotencyKey"] = key
        };

        var first = await admin.Client.PostAsJsonAsync("/api/mail/send", SendBody());
        first.EnsureSuccessStatusCode();
        var firstBody = (await first.Content.ReadFromJsonAsync<SendBody>())!;

        // Mutable world moves on: brand kit changes and the thread gains mail.
        (await admin.Client.PutAsJsonAsync("/api/brand-kit", new
        {
            name = "Changed",
            primaryColor = "#000000",
            accentColor = "#000000",
            textColor = "#000000",
            backgroundColor = "#FFFFFF",
            logoUrl = (string?)null,
            headerHtml = "<div>changed</div>",
            footerHtml = (string?)null,
            signatureHtml = (string?)null
        })).EnsureSuccessStatusCode();
        await using (var db = _factory.NewDbContext())
        {
            var folderId = await db.MailboxFolders.Where(f => f.MailboxConnectionId == connectionId)
                .Select(f => f.Id).FirstAsync();
            db.MailMessages.Add(new MailMessage
            {
                MailboxConnectionId = connectionId,
                FolderId = folderId,
                ThreadId = threadId,
                Uid = 99,
                UidValidity = 1,
                MessageId = "<later@test.local>",
                Subject = "Drift",
                FromAddr = "sender@example.com",
                MessageDate = DateTimeOffset.UtcNow
            });
            await db.SaveChangesAsync();
        }

        var retry = await admin.Client.PostAsJsonAsync("/api/mail/send", SendBody());
        retry.EnsureSuccessStatusCode();
        var retryBody = (await retry.Content.ReadFromJsonAsync<SendBody>())!;
        Assert.True(retryBody.Deduplicated);
        Assert.Equal(firstBody.MessageId, retryBody.MessageId);
    }

    [Fact]
    public async Task Pretransmission_failure_retries_same_key()
    {
        var admin = await ApiFixture.RegisterAdminAsync(_factory);
        var (connectionId, _, _) = await ApiFixture.SeedThreadAsync(_factory, admin.UserId);
        var key = $"notsent-{Guid.NewGuid():N}";

        _factory.Smtp.OnSend = _ => new SmtpNotSentException("Simulated unreachable host.");
        HttpResponseMessage failed;
        try
        {
            failed = await admin.Client.PostAsJsonAsync("/api/mail/send", Payload(connectionId, key));
        }
        finally
        {
            _factory.Smtp.OnSend = null;
        }
        Assert.Equal(HttpStatusCode.BadGateway, failed.StatusCode);
        var code = (await failed.Content.ReadFromJsonAsync<ErrorBody>())!.Code;
        Assert.Equal("not_sent", code);
        await using (var db = _factory.NewDbContext())
            Assert.Equal(SendOperationStatus.Failed,
                (await db.SendOperations.SingleAsync(o => o.RequestKey == key)).Status);

        var retry = await admin.Client.PostAsJsonAsync("/api/mail/send", Payload(connectionId, key));
        retry.EnsureSuccessStatusCode();
        var retryBody = (await retry.Content.ReadFromJsonAsync<SendBody>())!;
        Assert.False(retryBody.Deduplicated);
    }

    [Fact]
    public async Task Cancelled_transport_is_uncertain_and_never_resends()
    {
        var admin = await ApiFixture.RegisterAdminAsync(_factory);
        var (connectionId, _, _) = await ApiFixture.SeedThreadAsync(_factory, admin.UserId);
        var key = $"cancelled-{Guid.NewGuid():N}";

        _factory.Smtp.OnSend = _ => new OperationCanceledException();
        var before = _factory.Smtp.SendCount;
        try
        {
            await admin.Client.PostAsJsonAsync("/api/mail/send", Payload(connectionId, key));
        }
        catch (Exception ex) when (ex is TaskCanceledException or HttpRequestException)
        {
            // The request never completes normally once cancelled.
        }
        finally
        {
            _factory.Smtp.OnSend = null;
        }

        await using (var db = _factory.NewDbContext())
            Assert.Equal(SendOperationStatus.Uncertain,
                (await db.SendOperations.SingleAsync(o => o.RequestKey == key)).Status);

        var retry = await admin.Client.PostAsJsonAsync("/api/mail/send", Payload(connectionId, key));
        Assert.Equal(HttpStatusCode.BadGateway, retry.StatusCode);
        Assert.Equal(before + 1, _factory.Smtp.SendCount);
    }

    [Fact]
    public async Task Stale_sending_operation_becomes_uncertain()
    {
        var admin = await ApiFixture.RegisterAdminAsync(_factory);
        var (connectionId, _, _) = await ApiFixture.SeedThreadAsync(_factory, admin.UserId);
        var key = $"stale-{Guid.NewGuid():N}";

        await using (var db = _factory.NewDbContext())
        {
            db.SendOperations.Add(new SendOperation
            {
                CallerUserId = admin.UserId,
                MailboxConnectionId = connectionId,
                RequestKey = key,
                PayloadHash = StaleFingerprint(),
                WireMessageId = "<stale@test.local>",
                Status = SendOperationStatus.Sending,
                CreatedAt = DateTimeOffset.UtcNow.AddHours(-1),
                UpdatedAt = DateTimeOffset.UtcNow.AddHours(-1)
            });
            await db.SaveChangesAsync();
        }
        var before = _factory.Smtp.SendCount;

        var retry = await admin.Client.PostAsJsonAsync("/api/mail/send", StalePayload(connectionId, key));
        Assert.Equal(HttpStatusCode.BadGateway, retry.StatusCode);
        Assert.Equal(before, _factory.Smtp.SendCount);
        await using (var db = _factory.NewDbContext())
            Assert.Equal(SendOperationStatus.Uncertain,
                (await db.SendOperations.SingleAsync(o => o.RequestKey == key)).Status);
    }

    private static object StalePayload(Guid connectionId, string key) => new
    {
        mailboxConnectionId = connectionId,
        draftId = (Guid?)null,
        replyToThreadId = (Guid?)null,
        toAddrs = "receiver@test.local",
        ccAddrs = (string?)null,
        bccAddrs = (string?)null,
        subject = "Stale",
        bodyText = "Body",
        bodyHtml = (string?)null,
        attachmentIds = Array.Empty<Guid>(),
        skipBrandWrap = false,
        idempotencyKey = key
    };

    /// <summary>Test-only mirror of the server fingerprint over original request data.</summary>
    private static string StaleFingerprint()
    {
        var parts = new[]
        {
            "receiver@test.local", null, null, "Stale", "Body", null, "0", null, null, ""
        };
        var canonical = string.Join(" ", parts.Select(p => p ?? ""));
        return Convert.ToHexString(
            System.Security.Cryptography.SHA256.HashData(System.Text.Encoding.UTF8.GetBytes(canonical))).ToLowerInvariant();
    }

    private record AttachmentRef(Guid Id);
    private record ErrorBody(string? Error, string? Code);
}
