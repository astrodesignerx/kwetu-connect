using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Kompanion.Api.Data;
using Kompanion.Api.Jobs;
using Kompanion.Api.Models;
using Kompanion.Api.Services;
using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace Kompanion.Api.Services.Mail;

/// <summary>One send key was reused in a way that cannot proceed. Carries a machine-readable code.</summary>
public sealed class IdempotencyConflictException : InvalidOperationException
{
    public string Code { get; }

    public IdempotencyConflictException(string message, string code = "key_conflict") : base(message)
    {
        Code = code;
    }
}

/// <summary>
/// The SMTP outcome is unknown: the bytes may have gone out. Reporting this as a
/// plain failure would invite a resend and a duplicate delivery. Never resend under
/// the same idempotency key after this.
/// </summary>
public sealed class UncertainDeliveryException : Exception
{
    public UncertainDeliveryException(string message, Exception? inner = null) : base(message, inner) { }
}

/// <summary>
/// The transport failed before any transmission could have happened (connect or
/// authentication). Retrying is safe.
/// </summary>
public sealed class SmtpNotSentException : Exception
{
    public SmtpNotSentException(string message, Exception? inner = null) : base(message, inner) { }
}

/// <summary>
/// The draft was already sent or discarded (tombstoned). Saving it again would
/// resurrect content the user already disposed of.
/// </summary>
public sealed class DraftGoneException : InvalidOperationException
{
    public DraftGoneException(string message) : base(message) { }
}

/// <summary>
/// Owns draft persistence and the send pipeline. Reply sends resolve the latest
/// message in the thread and inherit its <c>Message-ID</c> chain so the outgoing
/// message threads correctly in the recipient's client and in our own.
///
/// Sends with an idempotency key are durable operations: the operation is persisted
/// before SMTP, claimed atomically, and replays return the original result without
/// another send. Once SMTP transmission starts, a failure is uncertainty, not a
/// plain error, the same key never resends.
/// </summary>
public class MailComposer
{
    private readonly AppDbContext _db;
    private readonly SmtpSender _smtp;
    private readonly TemplateRenderer _renderer;
    private readonly AuditService _audit;
    private readonly AttachmentStore _attachments;
    private readonly ILogger<MailComposer> _logger;

    public MailComposer(AppDbContext db, SmtpSender smtp, TemplateRenderer renderer, AuditService audit,
        AttachmentStore attachments, ILogger<MailComposer> logger)
    {
        _db = db;
        _smtp = smtp;
        _renderer = renderer;
        _audit = audit;
        _attachments = attachments;
        _logger = logger;
    }

    /// <summary>
    /// Autosaves a compose session. The client sends a session-stable id, so
    /// overlapping autosaves converge on one row instead of forking duplicates.
    /// A tombstoned id (sent or discarded) is rejected with 409 instead of
    /// resurrecting the row, including delayed in-flight saves and ids that
    /// collide across connections. Attachment binding authorizes files already
    /// bound to this org-scoped draft for any member, while unbound uploads still
    /// require ownership. Everything commits in one transaction, so rejected
    /// uploads leave no draft changes behind.
    /// </summary>
    public async Task<MailDraftDto> UpsertDraftAsync(Guid userId, DraftUpsertRequest req, CancellationToken ct)
    {
        var connection = await ConnectionInOrgAsync(req.MailboxConnectionId, userId, ct);
        var draftId = req.Id != Guid.Empty ? req.Id : Guid.NewGuid();

        // The lock lives inside the transaction below, so it is held across the
        // tombstone check, the lookup, and the commit: a delayed save cannot slip
        // between a send's delete and its tombstone, in either order.
        await using var tx = await _db.Database.BeginTransactionAsync(ct);
        try
        {
            await _db.Database.ExecuteSqlRawAsync(
                $"SELECT pg_advisory_xact_lock(hashtext('{draftId}'))", ct);

            if (await _db.DraftTombstones.AnyAsync(t => t.DraftId == draftId, ct))
                throw new DraftGoneException(
                    "This draft was already sent or discarded. It cannot be saved again.");

            var draft = await _db.MailDrafts.FirstOrDefaultAsync(
                d => d.Id == draftId && d.MailboxConnectionId == connection.Id, ct);
            if (draft is null)
            {
                // An id that resolves nowhere in this connection is either fresh or
                // belongs to another connection or organization: creating under it
                // would collide, so refuse instead of forking.
                if (req.Id != Guid.Empty && await _db.MailDrafts.AnyAsync(d => d.Id == draftId, ct))
                    throw new IdempotencyConflictException(
                        "This draft id is already in use elsewhere. Start a new composition.",
                        "draft_conflict");
                draft = new MailDraft { Id = draftId, MailboxConnectionId = connection.Id };
                _db.MailDrafts.Add(draft);
            }
            else if (req.ExpectedVersion.HasValue && req.ExpectedVersion.Value != draft.RowVersion)
            {
                // A teammate's (or a racing autosave's) edit landed first: reject
                // the stale write instead of silently overwriting it.
                throw new IdempotencyConflictException(
                    "This draft changed elsewhere. Reload it before saving again.",
                    "draft_conflict");
            }

            ApplyDraftFields(draft, req);

            // Validate and bind before anything is stored: files already bound to
            // this shared draft pass for any member of the org; unbound uploads
            // must belong to the caller; anything else (another draft, another
            // org) is rejected. When the caller supplies a binding set, rows bound
            // here but missing from it are unbound again.
            if (req.AttachmentIds is not null)
            {
                var ids = req.AttachmentIds.Distinct().ToList();
                var candidates = await _db.MailAttachments
                    .Where(a => ids.Contains(a.Id) && a.MessageId == null)
                    .ToListAsync(ct);
                if (candidates.Count != ids.Count)
                    throw new KeyNotFoundException("One or more attachments were not found.");
                foreach (var candidate in candidates)
                {
                    var boundHere = candidate.DraftId == draft.Id;
                    var ownStaged = candidate.OwnerUserId == userId && candidate.DraftId is null;
                    if (!boundHere && !ownStaged)
                        throw new KeyNotFoundException("One or more attachments were not found.");
                    candidate.DraftId = draft.Id;
                }

                var stale = await _db.MailAttachments
                    .Where(a => a.DraftId == draft.Id && !ids.Contains(a.Id))
                    .ToListAsync(ct);
                foreach (var attachment in stale)
                    attachment.DraftId = null;
            }

            await _db.SaveChangesAsync(ct);

            // Saved attachment state derives from the intended binding set, never
            // from stale client metadata.
            var bound = await _db.MailAttachments
                .Where(a => a.DraftId == draft.Id)
                .Select(a => new { a.Id, a.FileName, a.ContentType, a.SizeBytes })
                .ToListAsync(ct);
            draft.HasAttachments = bound.Count > 0;
            draft.AttachmentMetaJson = bound.Count > 0
                ? JsonSerializer.Serialize(bound.Select(b => new { name = b.FileName, contentType = b.ContentType }))
                : null;
            await _db.SaveChangesAsync(ct);
            await tx.CommitAsync(ct);
            return (await ToDtosAsync(new List<MailDraft> { draft }, ct)).Single();
        }
        catch (DbUpdateConcurrencyException)
        {
            await tx.RollbackAsync(CancellationToken.None);
            throw new IdempotencyConflictException(
                "This draft changed elsewhere. Reload it before saving again.",
                "draft_conflict");
        }
        catch (DbUpdateException ex) when (IsUniqueViolation(ex))
        {
            await tx.RollbackAsync(CancellationToken.None);
            throw new IdempotencyConflictException(
                "This draft id is already in use elsewhere. Start a new composition.",
                "draft_conflict");
        }
        catch
        {
            await tx.RollbackAsync(CancellationToken.None);
            throw;
        }
    }

    private static void ApplyDraftFields(MailDraft draft, DraftUpsertRequest req)
    {
        draft.ReplyToMessageId = req.ReplyToMessageId;
        draft.ReplyToAddress = req.ReplyToAddress;
        draft.ReferencesJson = req.References;
        draft.ReplyToThreadId = req.ReplyToThreadId;
        draft.SkipBrandWrap = req.SkipBrandWrap;
        draft.ToAddrs = NullIfBlank(req.ToAddrs);
        draft.CcAddrs = NullIfBlank(req.CcAddrs);
        draft.BccAddrs = NullIfBlank(req.BccAddrs);
        draft.Subject = NullIfBlank(req.Subject);
        draft.BodyText = NullIfBlank(req.BodyText);
        draft.BodyHtml = NullIfBlank(req.BodyHtml);
        draft.UpdatedAt = DateTimeOffset.UtcNow;
    }

    public async Task<List<MailDraftDto>> ListDraftsAsync(Guid userId, Guid connectionId, CancellationToken ct)
    {
        var connection = await ConnectionInOrgAsync(connectionId, userId, ct);
        var drafts = await _db.MailDrafts
            .Where(d => d.MailboxConnectionId == connection.Id)
            .OrderByDescending(d => d.UpdatedAt)
            .ToListAsync(ct);
        return await ToDtosAsync(drafts, ct);
    }

    public async Task<MailDraftDto?> GetDraftAsync(Guid userId, Guid draftId, CancellationToken ct)
    {
        var draft = await LoadDraftInOrgAsync(userId, draftId, ct);
        if (draft is null) return null;
        return (await ToDtosAsync(new List<MailDraft> { draft }, ct)).Single();
    }

    public async Task<bool> DeleteDraftAsync(Guid userId, Guid draftId, CancellationToken ct)
    {
        // The lock comes first: checking existence before locking lets an
        // in-flight save commit between the check and the delete, resurrecting
        // the row with no tombstone behind it.
        await using var tx = await _db.Database.BeginTransactionAsync(ct);
        try
        {
            await _db.Database.ExecuteSqlRawAsync(
                $"SELECT pg_advisory_xact_lock(hashtext('{draftId}'))", ct);
            var draft = await LoadDraftInOrgAsync(userId, draftId, ct);
            if (draft is null)
            {
                await tx.RollbackAsync(ct);
                return false;
            }
            _db.MailDrafts.Remove(draft);
            _db.DraftTombstones.Add(new DraftTombstone
            {
                DraftId = draft.Id,
                MailboxConnectionId = draft.MailboxConnectionId,
                Reason = "discarded"
            });
            await _db.SaveChangesAsync(ct);
            await tx.CommitAsync(ct);
            return true;
        }
        catch
        {
            await tx.RollbackAsync(CancellationToken.None);
            throw;
        }
    }

    /// <summary>
    /// A draft belongs to the shared mailbox, not to whoever happened to type it, so
    /// any member of the org can pick one up and finish it.
    /// </summary>
    private async Task<MailDraft?> LoadDraftInOrgAsync(Guid userId, Guid draftId, CancellationToken ct)
    {
        var orgId = await CallerOrgIdOrNullAsync(userId, ct);
        if (orgId is null) return null;

        return await _db.MailDrafts
            .Include(d => d.MailboxConnection)
            .ThenInclude(c => c!.User)
            .FirstOrDefaultAsync(
                d => d.Id == draftId && d.MailboxConnection.User!.OrganizationId == orgId, ct);
    }

    public async Task<SendResponse> SendAsync(Guid userId, SendRequest req, CancellationToken ct)
    {
        var connection = await ConnectionInOrgAsync(req.MailboxConnectionId, userId, ct);

        // Every send carries a durable identity: the key is looked up before any
        // mutable resource is touched, and an accepted send deleted its draft and
        // staged files while branding or the latest reply may have moved on since.
        // Replays below return the recorded outcome without validating resources
        // that are legitimately gone.
        var key = NormalizeKey(req.IdempotencyKey)
            ?? throw new InvalidOperationException("Idempotency-Key is required for sends.");
        var fingerprint = FingerprintRaw(req);
        SendOperation? failedOp = null;
        {
            var existing = await _db.SendOperations.AsNoTracking().FirstOrDefaultAsync(
                o => o.RequestKey == key && o.CallerUserId == userId
                    && o.MailboxConnectionId == connection.Id, ct);
            if (existing is not null)
            {
                // Uncertain and in-flight outcomes short-circuit for any payload:
                // nothing may be sent under this key, and the recorded outcome is
                // the answer regardless of what changed since.
                if (existing.Status == SendOperationStatus.Uncertain)
                    throw new UncertainDeliveryException(
                        "A previous attempt under this request key has an unknown outcome: it may have been sent. " +
                        "Do not resend. Check the Sent folder first, then start a new send if it is missing.");
                if (existing.Status == SendOperationStatus.Sending)
                {
                    if (await MarkStaleSendingUncertainAsync(existing, ct))
                        throw new UncertainDeliveryException(
                            "A previous attempt under this request key never reported back and is now too old " +
                            "to trust: it may have been sent. Do not resend. Check the Sent folder first, " +
                            "then start a new send if it is missing.");
                    return await WaitForPeerAsync(existing.Id, userId, connection, req, ct);
                }
                switch (existing.Status)
                {
                    case SendOperationStatus.Accepted:
                        if (!string.Equals(existing.PayloadHash, fingerprint, StringComparison.Ordinal))
                            throw new IdempotencyConflictException(
                                "This request key already delivered different content. Start a new send for this version.",
                                "already_sent");
                        await ConsumeDraftBestEffortAsync(req.DraftId, connection.Id, ct);
                        return new SendResponse(
                            existing.ResultMessageId ?? existing.WireMessageId, Deduplicated: true);
                    case SendOperationStatus.Failed:
                        if (!string.Equals(existing.PayloadHash, fingerprint, StringComparison.Ordinal))
                            throw new IdempotencyConflictException(
                                "This request key already failed with different content. Start a new send for this version.",
                                "failed_changed");
                        failedOp = existing;
                        break;
                    default:
                        return await WaitForPeerAsync(existing.Id, userId, connection, req, ct);
                }
            }
        }

        // Resolve the reply context: latest message in the thread, used for the
        // outgoing In-Reply-To and the References chain.
        string? inReplyTo = null;
        List<string>? references = null;
        long? replyToMessageId = null;
        DateTimeOffset? responseReceivedAt = null;
        string? responseMessageKey = null;
        Guid? responseClientId = null;
        Guid? responseMailboxId = null;
        // A draft is only destroyed after the SMTP hand-off succeeds, so a failed send
        // leaves the caller's composed content intact for a retry.
        MailDraft? consumedDraft = null;
        // Track whether the caller is replying to a thread — used to default subject
        // ("Re: …") and to address (last sender).
        var isReply = req.ReplyToThreadId is not null;
        var repliedSubject = (string?)null;
        if (isReply && req.ReplyToThreadId is { } replyThreadId)
        {
            // Resolve the thread inside the caller's organization before touching it.
            // A thread id from another org must be indistinguishable from a missing
            // one: the reply defaults (subject, last sender, Message-ID chain) are
            // foreign mail that the org-scoped endpoints never expose.
            var orgId = await CallerOrgIdAsync(userId, ct);
            var replyThread = await _db.MailThreads
                .Where(t => t.Id == replyThreadId && t.MailboxConnection.User!.OrganizationId == orgId)
                .Select(t => new { t.Subject, Email = t.MailboxConnection.Email, t.MailboxConnectionId })
                .FirstOrDefaultAsync(ct);
            if (replyThread is null)
                throw new KeyNotFoundException("Reply thread not found.");
            repliedSubject = replyThread.Subject;

            var latest = await _db.MailMessages
                .Where(m => m.ThreadId == replyThreadId)
                .OrderByDescending(m => m.MessageDate ?? m.InternalDate)
                .FirstOrDefaultAsync(ct);
            if (latest is null)
                throw new InvalidOperationException("Reply thread has no messages to reply to.");

            inReplyTo = latest.MessageId;

            // Response timing follows receipt order independently of reply header selection.
            var responseLatest = await _db.MailMessages.AsNoTracking()
                .Where(m => m.ThreadId == replyThreadId)
                .OrderByDescending(m => m.InternalDate ?? m.MessageDate ?? m.FetchedAt).ThenByDescending(m => m.Id)
                .Select(m => new { m.Id, m.MessageId, m.FromAddr, m.Folder.SpecialUse,
                    ReceivedAt = m.InternalDate ?? m.MessageDate ?? m.FetchedAt })
                .FirstOrDefaultAsync(ct);
            if (responseLatest is not null && responseLatest.SpecialUse != FolderSpecialUse.Sent
                && !string.Equals(responseLatest.FromAddr, replyThread.Email, StringComparison.OrdinalIgnoreCase))
            {
                responseReceivedAt = responseLatest.ReceivedAt;
                responseMessageKey = responseLatest.MessageId ?? $"row:{responseLatest.Id}";
                responseMailboxId = replyThread.MailboxConnectionId;
                responseClientId = await _db.ThreadCompanies.Where(t => t.ThreadId == replyThreadId)
                    .OrderBy(t => t.LinkedAt).ThenBy(t => t.CompanyId).Select(t => (Guid?)t.CompanyId).FirstOrDefaultAsync(ct)
                    ?? await _db.ThreadProjects.Where(t => t.ThreadId == replyThreadId)
                        .OrderBy(t => t.ProjectId).Select(t => (Guid?)t.Project.CompanyId).FirstOrDefaultAsync(ct);
            }
            replyToMessageId = latest.Id;
            var chain = new List<string>(latest.HeaderReferences ?? Array.Empty<string>());
            if (!string.IsNullOrEmpty(latest.MessageId)) chain.Add(latest.MessageId);
            references = chain;
        }
        // A draft can accompany either a fresh send or a reply: the compose window that
        // autosaved this content still owns the row, and leaving it behind makes
        // /drafts list mail that has already gone out. Consumed only after the SMTP
        // hand-off succeeds (see below). A key the client generated before any autosave
        // ran resolves to no row; that is a fresh send, not an error.
        if (req.DraftId is { } draftId)
        {
            var draft = await _db.MailDrafts
                .Include(d => d.MailboxConnection)
                .FirstOrDefaultAsync(d => d.Id == draftId, ct);
            if (draft is not null)
            {
                if (draft.MailboxConnectionId != connection.Id) throw new KeyNotFoundException("Draft not found.");
                // The reply context already resolved from ReplyToThreadId wins; a draft's
                // stored chain is the fallback for a draft resumed from the drafts list.
                replyToMessageId ??= draft.ReplyToMessageId;
                if (references is null && !string.IsNullOrEmpty(draft.ReferencesJson))
                {
                    try { references = JsonSerializer.Deserialize<List<string>>(draft.ReferencesJson); }
                    catch { references = null; }
                }
                consumedDraft = draft;
            }
        }

        // Build an in-memory draft for the sender so we can pass along the same shape.
        // For replies, default the To address to the last sender and prefix the subject
        // with "Re: " if the caller didn't override.
        var toAddrs = req.ToAddrs;
        var subject = req.Subject;
        if (isReply)
        {
            if (string.IsNullOrWhiteSpace(toAddrs) && replyToMessageId is not null)
            {
                var last = await _db.MailMessages
                    .Where(m => m.Id == replyToMessageId)
                    .Select(m => m.FromAddr)
                    .FirstOrDefaultAsync(ct);
                toAddrs = last;
            }
            if (string.IsNullOrWhiteSpace(subject) && !string.IsNullOrEmpty(repliedSubject))
                subject = repliedSubject.StartsWith("Re:", StringComparison.OrdinalIgnoreCase)
                    ? repliedSubject
                    : $"Re: {repliedSubject}";
        }

        // When the caller supplied a bodyHtml, wrap it in the brand kit (unless the
        // caller opted out). Variables in the body are substituted in the same pass.
        string? bodyHtml = req.BodyHtml;
        string? bodyText = req.BodyText;
        if (!string.IsNullOrEmpty(bodyHtml))
        {
            var kit = await _db.BrandKits.FirstOrDefaultAsync(k => k.OrganizationId == connection.User!.OrganizationId, ct);
            var values = ExtractVariables(bodyHtml, bodyText, subject);
            // The opt-out this comment has always described now exists. A body that
            // carries its own letterhead and footer would otherwise go out with the
            // kit's set wrapped around it — two of each.
            var wrap = kit is not null && !req.SkipBrandWrap;
            bodyHtml = _renderer.RenderBody(bodyHtml, values, kit, wrap);
            if (!wrap) bodyHtml = TemplateRenderer.BareDocument(bodyHtml);
            // If the caller only set html, derive a plain-text fallback by stripping tags.
            bodyText ??= StripHtml(bodyHtml);
        }
        else
        {
            bodyText ??= string.Empty;
        }

        var outgoing = new MailDraft
        {
            MailboxConnectionId = connection.Id,
            ReplyToMessageId = replyToMessageId,
            ToAddrs = toAddrs,
            CcAddrs = req.CcAddrs,
            BccAddrs = req.BccAddrs,
            Subject = subject,
            BodyText = bodyText,
            BodyHtml = bodyHtml
        };

        // Attachments come from two places: ids the caller passes (which must be the
        // caller's own staged uploads, or files bound to the draft being sent, never
        // another draft's uploads) and files already bound to the consumed draft.
        var attachments = new List<MailAttachment>();
        if (req.AttachmentIds is { Count: > 0 })
        {
            var ids = req.AttachmentIds.Distinct().ToList();
            var candidates = await _db.MailAttachments
                .Where(a => ids.Contains(a.Id) && a.MessageId == null)
                .ToListAsync(ct);
            if (candidates.Count != ids.Count)
                throw new KeyNotFoundException("One or more attachments were not found.");
            foreach (var candidate in candidates)
            {
                var ownStaged = candidate.OwnerUserId == userId && candidate.DraftId is null;
                var boundHere = consumedDraft is not null && candidate.DraftId == consumedDraft.Id;
                if (!ownStaged && !boundHere)
                    throw new KeyNotFoundException("One or more attachments were not found.");
            }
            attachments.AddRange(candidates);

            // A blob that vanished after upload (swept, or a crash between the blob
            // write and its row commit) is a pre-delivery failure: safe to retry, and
            // the operation below is only claimed once everything checks out.
            foreach (var attachment in attachments)
            {
                if (!_attachments.Exists(attachment.BlobKey))
                    throw new InvalidOperationException(
                        $"Attachment '{attachment.FileName}' is no longer available. Re-attach it and try again.");
            }
        }
        if (consumedDraft is not null)
        {
            var bound = await _db.MailAttachments
                .Where(a => a.DraftId == consumedDraft.Id && a.MessageId == null)
                .ToListAsync(ct);
            foreach (var attachment in bound)
            {
                if (attachments.All(a => a.Id != attachment.Id))
                    attachments.Add(attachment);
                if (!_attachments.Exists(attachment.BlobKey))
                    throw new InvalidOperationException(
                        $"Attachment '{attachment.FileName}' is no longer available. Re-attach it and try again.");
            }
        }

        var effective = new EffectivePayload(
            toAddrs, req.CcAddrs, req.BccAddrs, subject, bodyText, bodyHtml,
            req.SkipBrandWrap, req.ReplyToThreadId, inReplyTo, references,
            attachments.Select(a => a.Id).ToList(),
            req.ToAddrs, req.CcAddrs, req.BccAddrs, req.Subject, req.BodyText, req.BodyHtml,
            req.AttachmentIds?.Distinct().ToList(), responseReceivedAt, responseMessageKey, responseClientId, responseMailboxId);
        var effectiveJson = JsonSerializer.Serialize(effective);

        // A Failed retry replays the stored effective payload rather than
        // re-resolving mutable branding and reply targets.
        if (failedOp is not null)
        {
            var delivered = await TryReclaimAndDeliverAsync(failedOp.Id, userId, connection, req, ct);
            if (delivered is not null) return delivered;
            throw new IdempotencyConflictException(
                "This send is already in progress under the same request key. Wait for its result instead of sending again.",
                "in_progress");
        }

        var domain = connection.Email.Split('@', 2)[1];
        var op = new SendOperation
        {
            CallerUserId = userId,
            MailboxConnectionId = connection.Id,
            RequestKey = key,
            PayloadHash = fingerprint,
            WireMessageId = $"<{Guid.NewGuid():N}@{domain}>",
            DraftId = req.DraftId,
            EffectivePayloadJson = effectiveJson
        };
        _db.SendOperations.Add(op);
        try
        {
            await _db.SaveChangesAsync(ct);
        }
        catch (DbUpdateException ex) when (IsUniqueViolation(ex))
        {
            _db.Entry(op).State = EntityState.Detached;
            return await ReplayAsync(userId, connection, req, key, fingerprint, consumedDraft, effectiveJson, ct);
        }

        return await DeliverClaimedAsync(op, connection, userId, toAddrs,
            outgoing, references, inReplyTo, attachments, consumedDraft, ct);
    }

    /// <summary>The resolved, sendable form of one request, stored for safe retry.</summary>
    private sealed record EffectivePayload(
        string? ToAddrs, string? CcAddrs, string? BccAddrs,
        string? Subject, string? BodyText, string? BodyHtml,
        bool SkipBrandWrap, Guid? ReplyToThreadId,
        string? InReplyTo, List<string>? References, List<Guid> AttachmentIds,
        // Original request values, so a reopened draft can detect edits against
        // the failed attempt without re-rendering mutable branding.
        string? RawToAddrs, string? RawCcAddrs, string? RawBccAddrs,
        string? RawSubject, string? RawBodyText, string? RawBodyHtml,
        List<Guid>? RawAttachmentIds, DateTimeOffset? ResponseReceivedAt = null,
        string? ResponseMessageKey = null, Guid? ResponseClientId = null, Guid? ResponseMailboxId = null);

    private static EffectivePayload? DeserializeEffective(string? json)
    {
        if (string.IsNullOrEmpty(json)) return null;
        try { return JsonSerializer.Deserialize<EffectivePayload>(json); }
        catch { return null; }
    }

    /// <summary>
    /// A send that never reported back within a conservative age is uncertainty,
    /// not an in-flight peer: flip it once, atomically, and never resend it.
    /// </summary>
    private static readonly TimeSpan StaleSendingAfter = TimeSpan.FromMinutes(15);

    private async Task<bool> MarkStaleSendingUncertainAsync(SendOperation existing, CancellationToken ct)
    {
        if (DateTimeOffset.UtcNow - existing.UpdatedAt < StaleSendingAfter) return false;
        var now = DateTimeOffset.UtcNow;
        var rows = await _db.SendOperations
            .Where(o => o.Id == existing.Id && o.Status == SendOperationStatus.Sending)
            .ExecuteUpdateAsync(s => s
                .SetProperty(o => o.Status, SendOperationStatus.Uncertain)
                .SetProperty(o => o.Error, "The send never reported back and is now too old to trust.")
                .SetProperty(o => o.UpdatedAt, now), ct);
        return rows == 1;
    }

    /// <summary>
    /// Handles a send key that is already in use: replays acceptances, waits for an
    /// in-flight peer, reclaims safe failures, and never resends uncertainty.
    /// </summary>
    private async Task<SendResponse> ReplayAsync(Guid userId, MailboxConnection connection,
        SendRequest req, string key, string fingerprint, MailDraft? consumedDraft,
        string effectiveJson, CancellationToken ct)
    {
        for (var attempt = 0; attempt < 3; attempt++)
        {
            var existing = await _db.SendOperations.AsNoTracking().FirstOrDefaultAsync(
                o => o.RequestKey == key
                    && o.CallerUserId == userId
                    && o.MailboxConnectionId == connection.Id, ct);
            if (existing is null)
                throw new IdempotencyConflictException(
                    "This send is already in progress under the same request key. Wait for its result instead of sending again.",
                    "in_progress");
            if (existing.Status == SendOperationStatus.Uncertain)
                throw new UncertainDeliveryException(
                    "A previous attempt under this request key has an unknown outcome: it may have been sent. " +
                    "Do not resend. Check the Sent folder first, then start a new send if it is missing.");
            if (existing.Status == SendOperationStatus.Sending)
            {
                if (await MarkStaleSendingUncertainAsync(existing, ct))
                    throw new UncertainDeliveryException(
                        "A previous attempt under this request key never reported back and is now too old " +
                        "to trust: it may have been sent. Do not resend. Check the Sent folder first, " +
                        "then start a new send if it is missing.");
                return await WaitForPeerAsync(existing.Id, userId, connection, req, ct);
            }

            switch (existing.Status)
            {
                case SendOperationStatus.Accepted:
                    if (!string.Equals(existing.PayloadHash, fingerprint, StringComparison.Ordinal))
                        throw new IdempotencyConflictException(
                            "This request key already delivered different content. Start a new send for this version.",
                            "already_sent");
                    await ConsumeDraftBestEffortAsync(req.DraftId, connection.Id, ct);
                    return new SendResponse(
                        existing.ResultMessageId ?? existing.WireMessageId, Deduplicated: true);
                case SendOperationStatus.Failed:
                    {
                        var delivered = await TryReclaimAndDeliverAsync(
                            existing.Id, userId, connection, req, ct);
                        if (delivered is not null) return delivered;
                        await Task.Delay(100, ct);
                        break;
                    }
                default:
                    return await WaitForPeerAsync(existing.Id, userId, connection, req, ct);
            }
        }

        throw new IdempotencyConflictException(
            "This send is already in progress under the same request key. Wait for its result instead of sending again.",
            "in_progress");
    }

    /// <summary>
    /// Reclaims a safely failed operation and actually delivers it once from the
    /// stored effective payload. Returns null when a peer reclaimed it first, so
    /// the caller keeps waiting instead of stranding another Sending row.
    /// </summary>
    private async Task<SendResponse?> TryReclaimAndDeliverAsync(Guid operationId, Guid userId,
        MailboxConnection connection, SendRequest req, CancellationToken ct)
    {
        if (!await ReclaimAsync(operationId, ct)) return null;
        var reclaimed = await _db.SendOperations.FirstAsync(o => o.Id == operationId, ct);
        try
        {
            var stored = DeserializeEffective(reclaimed.EffectivePayloadJson);
            if (stored is null)
                throw new InvalidOperationException(
                    "The earlier attempt failed before delivery and its payload is unreadable. Retry the send with the same request key.");
            var consumedDraft = req.DraftId is null ? null : await _db.MailDrafts
                .Include(d => d.MailboxConnection)
                .FirstOrDefaultAsync(d => d.Id == req.DraftId, ct);
            if (consumedDraft is not null && consumedDraft.MailboxConnectionId != connection.Id)
                throw new KeyNotFoundException("Draft not found.");
            var storedAttachments = await LoadStoredAttachmentsAsync(
                userId, stored.AttachmentIds, consumedDraft, ct);
            var storedOutgoing = new MailDraft
            {
                MailboxConnectionId = connection.Id,
                ToAddrs = stored.ToAddrs,
                CcAddrs = stored.CcAddrs,
                BccAddrs = stored.BccAddrs,
                Subject = stored.Subject,
                BodyText = stored.BodyText,
                BodyHtml = stored.BodyHtml
            };
            return await DeliverClaimedAsync(reclaimed, connection, userId,
                stored.ToAddrs, storedOutgoing, stored.References, stored.InReplyTo,
                storedAttachments, consumedDraft, ct);
        }
        catch (Exception ex) when (ex is KeyNotFoundException or InvalidOperationException)
        {
            // Validation failed again: leave Failed, never strand Sending.
            await MarkAsync(operationId, SendOperationStatus.Failed, ex.Message, ct);
            throw;
        }
    }

    /// <summary>Attachment rows for a stored effective payload, validated fresh.</summary>
    private async Task<List<MailAttachment>> LoadStoredAttachmentsAsync(Guid userId,
        List<Guid> attachmentIds, MailDraft? consumedDraft, CancellationToken ct)
    {
        var loaded = new List<MailAttachment>();
        if (attachmentIds.Count > 0)
        {
            var ids = attachmentIds.Distinct().ToList();
            var candidates = await _db.MailAttachments
                .Where(a => ids.Contains(a.Id) && a.MessageId == null)
                .ToListAsync(ct);
            if (candidates.Count != ids.Count)
                throw new KeyNotFoundException("One or more attachments were not found.");
            foreach (var candidate in candidates)
            {
                var ownStaged = candidate.OwnerUserId == userId && candidate.DraftId is null;
                var boundHere = consumedDraft is not null && candidate.DraftId == consumedDraft.Id;
                if (!ownStaged && !boundHere)
                    throw new KeyNotFoundException("One or more attachments were not found.");
            }
            loaded.AddRange(candidates);
        }
        if (consumedDraft is not null)
        {
            var bound = await _db.MailAttachments
                .Where(a => a.DraftId == consumedDraft.Id && a.MessageId == null)
                .ToListAsync(ct);
            foreach (var attachment in bound)
            {
                if (loaded.All(a => a.Id != attachment.Id))
                    loaded.Add(attachment);
            }
        }
        foreach (var attachment in loaded)
        {
            if (!_attachments.Exists(attachment.BlobKey))
                throw new InvalidOperationException(
                    $"Attachment '{attachment.FileName}' is no longer available. Re-attach it and try again.");
        }
        return loaded;
    }

    private async Task<bool> ReclaimAsync(Guid operationId, CancellationToken ct)
    {
        // Conditional update: only one racing caller flips Failed back to Sending.
        var now = DateTimeOffset.UtcNow;
        var rows = await _db.SendOperations
            .Where(o => o.Id == operationId && o.Status == SendOperationStatus.Failed)
            .ExecuteUpdateAsync(s => s
                .SetProperty(o => o.Status, SendOperationStatus.Sending)
                .SetProperty(o => o.UpdatedAt, now), ct);
        return rows == 1;
    }

    /// <summary>
    /// Waits for the peer holding a claim, then replays its outcome. A peer that
    /// fails safely is reclaimed and delivered exactly once by this waiter; the
    /// operation is never stranded in Sending by the wait itself.
    /// </summary>
    private async Task<SendResponse> WaitForPeerAsync(Guid operationId, Guid userId,
        MailboxConnection connection, SendRequest req, CancellationToken ct)
    {
        for (var i = 0; i < 100; i++)
        {
            await Task.Delay(100, ct);
            var current = await _db.SendOperations.AsNoTracking()
                .FirstOrDefaultAsync(o => o.Id == operationId, ct);
            if (current is null)
                throw new IdempotencyConflictException(
                    "This send is already in progress under the same request key. Wait for its result instead of sending again.",
                    "in_progress");
            if (current.Status == SendOperationStatus.Accepted)
            {
                await ConsumeDraftBestEffortAsync(req.DraftId, connection.Id, ct);
                return new SendResponse(current.ResultMessageId ?? current.WireMessageId, Deduplicated: true);
            }
            if (current.Status == SendOperationStatus.Uncertain)
                throw new UncertainDeliveryException(
                    "A previous attempt under this request key has an unknown outcome: it may have been sent. " +
                    "Do not resend. Check the Sent folder first, then start a new send if it is missing.");
            if (current.Status == SendOperationStatus.Failed)
            {
                var delivered = await TryReclaimAndDeliverAsync(operationId, userId, connection, req, ct);
                if (delivered is not null) return delivered;
                // A peer reclaimed it; keep waiting for that peer.
            }
        }

        throw new IdempotencyConflictException(
            "This send is still in progress under the same request key. Wait for its result instead of sending again.",
            "in_progress");
    }

    /// <summary>
    /// Performs the SMTP hand-off for a claimed operation, then durable acceptance and
    /// best-effort housekeeping. Only genuine pre-delivery failures stay retryable;
    /// anything once transmission may have started is uncertainty.
    /// </summary>
    private async Task<SendResponse> DeliverClaimedAsync(SendOperation op, MailboxConnection connection,
        Guid userId, string? toAddrs, MailDraft outgoing, List<string>? references, string? inReplyTo,
        List<MailAttachment> attachments, MailDraft? consumedDraft, CancellationToken ct)
    {
        SentMessage sent;
        try
        {
            sent = await _smtp.SendAsync(
                connection, outgoing, references, inReplyTo, attachments, ct, op.WireMessageId);
        }
        catch (SmtpNotSentException)
        {
            // The transport never transmitted: the key stays usable for a safe retry.
            await MarkAsync(op.Id, SendOperationStatus.Failed, "Transport failed before transmission.", ct);
            throw;
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            await MarkAsync(op.Id, SendOperationStatus.Uncertain,
                "SMTP outcome unknown: " + ex.Message, ct);
            throw new UncertainDeliveryException(
                "The send may or may not have completed. Do not resend: check the Sent folder first, " +
                "then start a new send if it is missing.", ex);
        }
        catch (OperationCanceledException)
        {
            // Cancellation during the hand-off cannot prove nothing was transmitted.
            await MarkAsync(op.Id, SendOperationStatus.Uncertain,
                "Send cancelled during transmission: outcome unknown.", CancellationToken.None);
            throw new UncertainDeliveryException(
                "The send was cancelled and may or may not have completed. Do not resend: check the " +
                "Sent folder first, then start a new send if it is missing.");
        }

        // Durable acceptance. If persisting it fails, the operation stays uncertain in
        // the database while the current caller still learns the known acceptance.
        var acceptancePersisted = false;
        try
        {
            op.Status = SendOperationStatus.Accepted;
            op.ResultMessageId = sent.MessageId;
            op.UpdatedAt = DateTimeOffset.UtcNow;
            await _db.SaveChangesAsync(CancellationToken.None);
            acceptancePersisted = true;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Could not persist send acceptance for operation {Id}; keeping it uncertain.", op.Id);
            await MarkAsync(op.Id, SendOperationStatus.Uncertain,
                "Accepted by SMTP but the acceptance record could not be saved.", ct);
        }

        // Reply state and response-time metrics are best effort: a failure here (for
        // example a client deleted mid-send) must never change the recorded send outcome.
        if (acceptancePersisted)
        {
            try
            {
                await RecordSignalReplyAsync(op, CancellationToken.None);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Could not record reply state or response time for operation {Id}.", op.Id);
            }
        }

        // Sent filing runs after durable acceptance: it is slow bookkeeping, never
        // part of the acceptance decision.
        await _smtp.FileSentCopyAsync(connection, sent.Mime, ct);

        await HousekeepingAsync(connection, userId, toAddrs, consumedDraft, attachments, ct);
        return new SendResponse(sent.MessageId, Deduplicated: false);
    }

    private async Task RecordSignalReplyAsync(SendOperation op, CancellationToken ct)
    {
        var payload = DeserializeEffective(op.EffectivePayloadJson);
        if (payload?.ReplyToThreadId is not { } threadId) return;
        // Only move to Awaiting if nothing changed the thread after Send was pressed: a new
        // inbound mail arriving during SMTP must keep the thread in ToReply, while earlier
        // manual changes (reopen, Done) are superseded by this reply.
        await _db.MailThreads.Where(t => t.Id == threadId && t.StateSince <= op.CreatedAt)
            .ExecuteUpdateAsync(set => set.SetProperty(t => t.ReplyState, ReplyState.Awaiting)
                .SetProperty(t => t.StateSince, op.UpdatedAt).SetProperty(t => t.NeedsNudge, false), ct);
        if (payload.ResponseReceivedAt is not { } received || payload.ResponseMessageKey is not { } key
            || payload.ResponseMailboxId is not { } mailboxId || received > op.UpdatedAt) return;
        var seconds = (op.UpdatedAt - received).TotalSeconds;
        // A second reply before Sent sync, or a concurrent send, cannot add a second first-reply sample.
        await _db.Database.ExecuteSqlInterpolatedAsync($"""
            INSERT INTO "ThreadResponseTimes"
                ("Id", "SendOperationId", "MailboxConnectionId", "ThreadId", "UserId", "CompanyId", "InboundMessageKey", "ReceivedAt", "SentAt", "Seconds")
            VALUES ({Guid.NewGuid()}, {op.Id}, {mailboxId}, {threadId}, {op.CallerUserId}, {payload.ResponseClientId}, {key}, {received}, {op.UpdatedAt}, {seconds})
            ON CONFLICT DO NOTHING
            """, ct);
    }

    private async Task MarkAsync(Guid operationId, SendOperationStatus status, string? error, CancellationToken ct)
    {
        try
        {
            var op = await _db.SendOperations.FirstOrDefaultAsync(o => o.Id == operationId, ct);
            if (op is null) return;
            op.Status = status;
            op.Error = error;
            op.UpdatedAt = DateTimeOffset.UtcNow;
            await _db.SaveChangesAsync(ct);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Could not mark send operation {Id} as {Status}.", operationId, status);
        }
    }

    private async Task ConsumeDraftBestEffortAsync(Guid? draftId, Guid connectionId, CancellationToken ct)
    {
        if (draftId is null) return;
        try
        {
            await using var tx = await _db.Database.BeginTransactionAsync(ct);
            try
            {
                await _db.Database.ExecuteSqlRawAsync(
                    $"SELECT pg_advisory_xact_lock(hashtext('{draftId}'))", ct);
                var draft = await _db.MailDrafts
                    .FirstOrDefaultAsync(d => d.Id == draftId && d.MailboxConnectionId == connectionId, ct);
                if (draft is not null)
                    await _db.Entry(draft).ReloadAsync(ct);
                if (draft is not null)
                {
                    if (_db.Entry(draft).State != EntityState.Detached)
                        _db.MailDrafts.Remove(draft);
                }
                if (!await _db.DraftTombstones.AnyAsync(t => t.DraftId == draftId, ct))
                {
                    _db.DraftTombstones.Add(new DraftTombstone
                    {
                        DraftId = draftId.Value,
                        MailboxConnectionId = connectionId,
                        Reason = "sent"
                    });
                }
                await _db.SaveChangesAsync(ct);
                await tx.CommitAsync(ct);
            }
            catch
            {
                await tx.RollbackAsync(CancellationToken.None);
                throw;
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Could not consume duplicate draft {Id} on send replay.", draftId);
        }
    }

    /// <summary>
    /// Everything after acceptance: draft consumption, staged-attachment cleanup, audit
    /// and sync scheduling. Best effort throughout, none of it may turn an accepted
    /// send into a reported failure.
    /// </summary>
    private async Task HousekeepingAsync(MailboxConnection connection, Guid userId, string? toAddrs,
        MailDraft? consumedDraft, List<MailAttachment> attachments, CancellationToken ct)
    {
        // Only now that the server has accepted the message is it safe to consume the
        // draft (and its staged attachment rows — the FK cascades them). A send that
        // fails before this point must leave the composed content recoverable.
        try
        {
            await using var tx = await _db.Database.BeginTransactionAsync(ct);
            try
            {
                if (consumedDraft is not null)
                {
                    // Serialized with autosaves of the same id under one
                    // transaction: a delayed save cannot slip in between the
                    // delete and the tombstone.
                    await _db.Database.ExecuteSqlRawAsync(
                        $"SELECT pg_advisory_xact_lock(hashtext('{consumedDraft.Id}'))", ct);
                }
                // Draft-bound rows cascade off the draft delete; unbound staged rows are
                // removed directly. The consumed draft id is tombstoned so a delayed
                // autosave racing the send cannot resurrect it.
                var unbound = attachments.Where(a => a.DraftId == null).ToList();
                if (consumedDraft is not null)
                {
                    await _db.Entry(consumedDraft).ReloadAsync(ct);
                    if (_db.Entry(consumedDraft).State != EntityState.Detached)
                        _db.MailDrafts.Remove(consumedDraft);
                    if (!await _db.DraftTombstones.AnyAsync(t => t.DraftId == consumedDraft.Id, ct))
                        _db.DraftTombstones.Add(new DraftTombstone
                    {
                        DraftId = consumedDraft.Id,
                        MailboxConnectionId = connection.Id,
                        Reason = "sent"
                    });
                }
                if (unbound.Count > 0) _db.MailAttachments.RemoveRange(unbound);
                if (consumedDraft is not null || unbound.Count > 0)
                    await _db.SaveChangesAsync(ct);
                await tx.CommitAsync(ct);
            }
            catch
            {
                await tx.RollbackAsync(CancellationToken.None);
                throw;
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Send housekeeping (draft/attachment cleanup) failed for {Mailbox}.", connection.Email);
        }

        // Sending as a mailbox you don't own is legitimate on a shared inbox, but it
        // should leave a trail: the recipient sees the mailbox's address, not yours.
        if (connection.UserId != userId)
        {
            try
            {
                var actor = await _db.Users.FirstOrDefaultAsync(u => u.Id == userId, ct);
                await _audit.LogAsync(userId, actor?.Email ?? "", "mail.send.shared_mailbox",
                    targetUserId: connection.UserId, targetEmail: connection.User?.Email,
                    targetMailboxId: connection.Id,
                    details: $"Sent as {connection.Email} to {toAddrs}");
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Shared-mailbox send audit failed for {Mailbox}.", connection.Email);
            }
        }

        // Force a fresh incremental sync so the server's auto-Sent save (and any
        // contact created for the recipient) appear in the inbox view promptly.
        try
        {
            MailSyncJobs.TriggerIncremental(connection.Id);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Could not enqueue post-send sync for {Mailbox}.", connection.Email);
        }
    }

    /// <summary>
    /// Resolves a mailbox the caller shares an organization with — not one they have to
    /// own. The shared inbox is the product: requiring ownership here meant only one
    /// person could reply from a team mailbox or even list its drafts, while everyone
    /// saw the Reply and Drafts affordances regardless.
    ///
    /// Sending still authenticates as the mailbox, using the owner's stored credentials
    /// from the vault, so mail goes out from the address it appears to come from.
    /// </summary>
    private async Task<MailboxConnection> ConnectionInOrgAsync(Guid connectionId, Guid userId, CancellationToken ct)
    {
        var orgId = await CallerOrgIdAsync(userId, ct);

        var connection = await _db.MailboxConnections
            .Include(c => c.User)
            .FirstOrDefaultAsync(c => c.Id == connectionId && c.User!.OrganizationId == orgId, ct);

        if (connection is null) throw new KeyNotFoundException("Mailbox connection not found.");
        if (!connection.IsActive) throw new InvalidOperationException("Mailbox is not active.");
        return connection;
    }

    /// <summary>
    /// The caller's organization. Every lookup in this service is scoped by it, so a
    /// thread, draft or attachment id from another org resolves to "not found" rather
    /// than to a cross-org read.
    /// </summary>
    private async Task<int> CallerOrgIdAsync(Guid userId, CancellationToken ct)
    {
        var orgId = await CallerOrgIdOrNullAsync(userId, ct);
        if (orgId is null) throw new KeyNotFoundException("Mailbox connection not found.");
        return orgId.Value;
    }

    /// <summary>
    /// Same lookup, but for read paths whose contract is "null means not found" rather
    /// than "throw": a caller that no longer resolves yields null instead of a 500.
    /// </summary>
    private async Task<int?> CallerOrgIdOrNullAsync(Guid userId, CancellationToken ct) =>
        await _db.Users
            .Where(u => u.Id == userId)
            .Select(u => (int?)u.OrganizationId)
            .FirstOrDefaultAsync(ct);

    private static string? NullIfBlank(string? v) => string.IsNullOrWhiteSpace(v) ? null : v;

    private static string? NormalizeKey(string? key)
    {
        if (string.IsNullOrWhiteSpace(key)) return null;
        var trimmed = key.Trim();
        if (trimmed.Length > 128)
            throw new InvalidOperationException("Idempotency-Key is too long (maximum 128 characters).");
        return trimmed;
    }

    /// <summary>
    /// Fingerprint over the original request data only. Rendered bodies, resolved
    /// reply defaults and current brand output are deliberately excluded: they are
    /// mutable, and their drift must never turn an identical retry into a conflict.
    /// </summary>
    private static string FingerprintRaw(SendRequest req)
    {
        var parts = new[]
        {
            req.ToAddrs, req.CcAddrs, req.BccAddrs, req.Subject, req.BodyText, req.BodyHtml,
            req.SkipBrandWrap ? "1" : "0",
            req.ReplyToThreadId?.ToString("N"),
            req.DraftId?.ToString("N"),
            req.AttachmentIds is null
                ? null
                : string.Join(",", req.AttachmentIds.Distinct().OrderBy(id => id).Select(id => id.ToString("N")))
        };
        var canonical = string.Join(" ", parts.Select(p => p ?? ""));
        return Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(canonical))).ToLowerInvariant();
    }

    private static bool IsUniqueViolation(DbUpdateException ex)
    {
        for (var inner = ex.InnerException; inner is not null; inner = inner.InnerException)
        {
            if (inner is PostgresException pg && pg.SqlState == PostgresErrorCodes.UniqueViolation)
                return true;
        }
        return false;
    }

    private static Dictionary<string, string?> ExtractVariables(string? bodyHtml, string? bodyText, string? subject)
    {
        // Variables are {{name}} in either the body or subject. We don't know the
        // caller's intent for each variable; for the default-send path we just put
        // the variable name back as the value (so the template is rendered with the
        // placeholders visible). The compose UI does its own variable-to-value mapping
        // before calling send, so this branch is a defensive fallback.
        var names = new HashSet<string>();
        var re = new System.Text.RegularExpressions.Regex(@"\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}");
        foreach (var src in new[] { bodyHtml, bodyText, subject })
            if (!string.IsNullOrEmpty(src))
                foreach (System.Text.RegularExpressions.Match m in re.Matches(src))
                    names.Add(m.Groups[1].Value);
        return names.ToDictionary(n => n, n => (string?)("{{" + n + "}}"));
    }

    private static string StripHtml(string html)
    {
        var text = System.Text.RegularExpressions.Regex.Replace(html, "<[^>]+>", " ");
        return System.Text.RegularExpressions.Regex.Replace(text, @"\s+", " ").Trim();
    }

    /// <summary>
    /// Builds draft DTOs with the actual In-Reply-To (resolved from the reply target,
    /// so a resumed reply carries real headers) and the attachments bound to each
    /// draft. Batched per call; draft lists are small.
    /// </summary>
    private async Task<List<MailDraftDto>> ToDtosAsync(List<MailDraft> drafts, CancellationToken ct)
    {
        var draftIds = drafts.Select(d => d.Id).ToList();
        var bound = await _db.MailAttachments
            .Where(a => a.DraftId != null && draftIds.Contains(a.DraftId.Value))
            .Select(a => new { DraftId = a.DraftId!.Value, a.Id, a.FileName, a.ContentType, a.SizeBytes })
            .ToListAsync(ct);
        var boundByDraft = bound.GroupBy(a => a.DraftId)
            .ToDictionary(g => g.Key, g => g.Select(a =>
                new AttachmentDto(a.Id, a.FileName, a.ContentType, a.SizeBytes, false, null)).ToList());

        var messageIds = drafts
            .Where(d => d.ReplyToMessageId is not null)
            .Select(d => d.ReplyToMessageId!.Value)
            .Distinct()
            .ToList();
        var messageIdByDbId = messageIds.Count == 0
            ? new Dictionary<long, string?>()
            : await _db.MailMessages
                .Where(m => messageIds.Contains(m.Id))
                .ToDictionaryAsync(m => m.Id, m => m.MessageId, ct);

        var threadIds = drafts
            .Where(d => d.ReplyToMessageId is null && d.ReplyToThreadId is not null)
            .Select(d => d.ReplyToThreadId!.Value)
            .Distinct()
            .ToList();        var inReplyByThread = new Dictionary<Guid, string?>();
        if (threadIds.Count > 0)
        {
            var threadMessages = await _db.MailMessages
                .Where(m => m.ThreadId != null && threadIds.Contains(m.ThreadId.Value))
                .Select(m => new { ThreadId = m.ThreadId!.Value, m.MessageId, m.MessageDate, m.InternalDate })
                .ToListAsync(ct);
            foreach (var group in threadMessages.GroupBy(m => m.ThreadId))
                inReplyByThread[group.Key] = group
                    .OrderByDescending(m => m.MessageDate ?? m.InternalDate)
                    .First().MessageId;
        }

        // Latest send attempt per draft, for any member: lets a resumed draft show
        // the recorded outcome and carry enough original intent to detect edits
        // safely across reloads.
        var lastSendByDraft = new Dictionary<Guid, DraftLastSendDto>();
        if (draftIds.Count > 0)
        {
            var ops = await _db.SendOperations
                .Where(o => o.DraftId != null && draftIds.Contains(o.DraftId.Value))
                .Select(o => new { DraftId = o.DraftId!.Value, o.RequestKey, o.Status, o.CreatedAt, o.EffectivePayloadJson })
                .ToListAsync(ct);
            foreach (var group in ops.GroupBy(o => o.DraftId))
            {
                var latest = group.OrderByDescending(o => o.CreatedAt).First();
                var effective = DeserializeEffective(latest.EffectivePayloadJson);
                lastSendByDraft[group.Key] = new DraftLastSendDto(
                    latest.RequestKey, latest.Status.ToString(),
                    effective?.ToAddrs, effective?.CcAddrs, effective?.BccAddrs,
                    effective?.Subject, effective?.BodyHtml,
                    effective?.AttachmentIds, effective?.SkipBrandWrap ?? false,
                    effective?.RawToAddrs, effective?.RawCcAddrs, effective?.RawBccAddrs,
                    effective?.RawSubject, effective?.RawBodyHtml, effective?.RawAttachmentIds);
            }
        }

        return drafts.Select(d =>
        {
            string? inReplyTo = null;
            if (d.ReplyToMessageId is { } replyDbId)
                messageIdByDbId.TryGetValue(replyDbId, out inReplyTo);
            else if (d.ReplyToThreadId is { } replyThreadId)
                inReplyByThread.TryGetValue(replyThreadId, out inReplyTo);
            boundByDraft.TryGetValue(d.Id, out var attachments);
            lastSendByDraft.TryGetValue(d.Id, out var lastSend);
            return new MailDraftDto(
                d.Id, d.MailboxConnectionId,
                d.ReplyToMessageId, d.ReplyToAddress,
                d.ReferencesJson,
                d.ToAddrs, d.CcAddrs, d.BccAddrs,
                d.Subject, d.BodyText, d.BodyHtml,
                d.HasAttachments, d.AttachmentMetaJson,
                d.CreatedAt, d.UpdatedAt,
                d.ReplyToThreadId, d.SkipBrandWrap,
                inReplyTo, attachments ?? new List<AttachmentDto>(),
                lastSend, d.RowVersion);
        }).ToList();
    }
}
