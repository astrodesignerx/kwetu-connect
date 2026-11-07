using System.Security.Claims;
using Kompanion.Api.Auth;
using Kompanion.Api.Data;
using Kompanion.Api.Jobs;
using Kompanion.Api.Models;
using Kompanion.Api.Services.Mail;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using NpgsqlTypes;

namespace Kompanion.Api.Controllers;

[ApiController]
[Route("api/mail")]
[Authorize]
public class MailController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly MailActionService _actions;
    private readonly MailComposer _composer;
    private readonly AttachmentStore _attachments;

    public MailController(AppDbContext db, MailActionService actions, MailComposer composer,
        AttachmentStore attachments)
    {
        _db = db;
        _actions = actions;
        _composer = composer;
        _attachments = attachments;
    }

    [HttpGet("overview")]
    public async Task<IActionResult> Overview(CancellationToken ct)
    {
        var userId = UserId();
        var orgId = OrgId();

        // Phase 7: shared inbox. Every member of the org sees every connected mailbox.
        var mailboxes = await _db.MailboxConnections
            .Include(c => c.User)
            .Where(c => c.User!.OrganizationId == orgId && c.IsActive)
            .ToListAsync(ct);

        var ids = mailboxes.Select(m => m.Id).ToList();
        var counts = await _db.MailMessages
            .Where(m => ids.Contains(m.MailboxConnectionId))
            .GroupBy(m => m.MailboxConnectionId)
            .Select(g => new
            {
                Id = g.Key,
                Total = g.Count(),
                Unread = g.Count(x => !x.Flags.Contains("Seen") && x.Folder.SpecialUse == FolderSpecialUse.Inbox)
            })
            .ToListAsync(ct);
        var countMap = counts.ToDictionary(c => c.Id);

        var dtos = mailboxes.Select(m => new MailboxStatusDto(
            m.Id, m.Email, m.SyncState.ToString(), m.SyncError,
            m.LastSyncCompletedAt,
            countMap.GetValueOrDefault(m.Id)?.Total ?? 0,
            countMap.GetValueOrDefault(m.Id)?.Unread ?? 0,
            m.ImapHost, m.SmtpHost)).ToList();

        return Ok(new MailOverviewDto(dtos));
    }

    [HttpGet("threads")]
    public async Task<IActionResult> Threads(
        [FromQuery] Guid connectionId,
        [FromQuery] string? folder,
        [FromQuery(Name = "q")] string? query,
        [FromQuery] string? assignee,
        [FromQuery(Name = "mine")] bool mine = false,
        [FromQuery] int page = 0,
        [FromQuery] int pageSize = 50,
        CancellationToken ct = default)
    {
        if (!await MailboxInOrgAsync(connectionId, OrgId())) return NotFound(errorResponse("Mailbox not found."));
        pageSize = Math.Clamp(pageSize, 1, 200);

        IQueryable<MailThread> q = _db.MailThreads
            .Where(t => t.MailboxConnectionId == connectionId);

        if (!string.IsNullOrWhiteSpace(query))
        {
            var matchingThreadIds = _db.MailMessages
                .Where(m => m.MailboxConnectionId == connectionId
                    && m.SearchVector!.Matches(EF.Functions.WebSearchToTsQuery("english", query))
                    && m.ThreadId != null)
                .Select(m => m.ThreadId!.Value)
                .Distinct();
            q = q.Where(t => matchingThreadIds.Contains(t.Id));
        }

        if (!string.IsNullOrWhiteSpace(folder) && !folder.Equals("all", StringComparison.OrdinalIgnoreCase))
        {
            q = folder.ToLowerInvariant() switch
            {
                "unread" => q.Where(t => t.HasUnread),
                "inbox" => q.Where(t => t.Messages.Any(m => m.Folder.SpecialUse == FolderSpecialUse.Inbox)),
                "sent" => q.Where(t => t.Messages.Any(m => m.Folder.SpecialUse == FolderSpecialUse.Sent)),
                "archive" => q.Where(t => t.Messages.Any(m => m.Folder.SpecialUse == FolderSpecialUse.Archive)),
                _ => q
            };
        }

        var userId = UserId();
        if (mine)
        {
            q = q.Where(t => _db.ThreadAssignments.Any(a => a.ThreadId == t.Id && a.UserId == userId));
        }
        else if (!string.IsNullOrEmpty(assignee))
        {
            if (assignee == "unassigned")
                q = q.Where(t => !_db.ThreadAssignments.Any(a => a.ThreadId == t.Id));
            else if (Guid.TryParse(assignee, out var assigneeId))
                q = q.Where(t => _db.ThreadAssignments.Any(a => a.ThreadId == t.Id && a.UserId == assigneeId));
        }

        var total = await q.CountAsync(ct);
        var items = await q.OrderByDescending(t => t.LastDate)
            .Skip(page * pageSize).Take(pageSize)
            .Select(t => new ThreadSummaryDto(
                t.Id, t.Subject, t.Participants, t.Snippet,
                t.MessageCount, t.FirstDate, t.LastDate,
                t.HasUnread, t.HasAttachments, t.ReplyState.ToString(), t.StateSince, t.NeedsNudge))
            .ToListAsync(ct);

        return Ok(new ThreadListResponse(total, items));
    }

    /// <summary>
    /// Counts behind each filter tab, so a tab can say how much is waiting there
    /// before you click it. One round trip rather than six list calls.
    /// </summary>
    [HttpGet("thread-counts")]
    public async Task<IActionResult> ThreadCounts([FromQuery] Guid connectionId, CancellationToken ct)
    {
        if (!await MailboxInOrgAsync(connectionId, OrgId())) return NotFound(errorResponse("Mailbox not found."));

        var userId = UserId();
        var threads = _db.MailThreads.Where(t => t.MailboxConnectionId == connectionId);

        return Ok(new ThreadCountsDto(
            Inbox: await threads.CountAsync(t => t.Messages.Any(m => m.Folder.SpecialUse == FolderSpecialUse.Inbox), ct),
            Unread: await threads.CountAsync(t => t.HasUnread, ct),
            Mine: await threads.CountAsync(t => _db.ThreadAssignments.Any(a => a.ThreadId == t.Id && a.UserId == userId), ct),
            Sent: await threads.CountAsync(t => t.Messages.Any(m => m.Folder.SpecialUse == FolderSpecialUse.Sent), ct),
            Archive: await threads.CountAsync(t => t.Messages.Any(m => m.Folder.SpecialUse == FolderSpecialUse.Archive), ct),
            All: await threads.CountAsync(ct)));
    }

    [HttpGet("threads/{id:guid}")]
    public async Task<IActionResult> Thread(Guid id, CancellationToken ct)
    {
        var orgId = OrgId();
        var thread = await _db.MailThreads
            .Include(t => t.MailboxConnection)
            .FirstOrDefaultAsync(t => t.Id == id && t.MailboxConnection!.User!.OrganizationId == orgId, ct);
        if (thread is null) return NotFound(errorResponse("Thread not found."));

        var messages = await _db.MailMessages
            .Where(m => m.ThreadId == id)
            .OrderBy(m => m.MessageDate ?? m.InternalDate)
            .Select(m => new MessageDto(
                m.Id, m.MessageId, m.Folder.FullName, m.Folder.SpecialUse.ToString(),
                m.FromName, m.FromAddr, m.ToAddrs, m.CcAddrs,
                m.MessageDate, m.Subject, m.Snippet,
                m.BodyText, m.BodyHtml, m.Flags, m.HasAttachments, m.AttachmentMetaJson,
                m.Attachments
                    .OrderBy(a => a.FileName)
                    .Select(a => new AttachmentDto(
                        a.Id, a.FileName, a.ContentType, a.SizeBytes, a.IsInline, a.ContentId))
                    .ToList()))
            .ToListAsync(ct);

        return Ok(new ThreadDetailDto(
            thread.Id, thread.Subject, thread.FirstDate, thread.LastDate,
            thread.MessageCount, thread.HasUnread, messages,
            thread.ReplyState.ToString(), thread.StateSince, thread.NeedsNudge));
    }

    [HttpPost("threads/{id:guid}/read")]
    public async Task<IActionResult> SetRead(Guid id, SetReadRequest body, CancellationToken ct)
    {
        var orgId = OrgId();
        var thread = await _db.MailThreads
            .Include(t => t.MailboxConnection)
            .FirstOrDefaultAsync(t => t.Id == id && t.MailboxConnection!.User!.OrganizationId == orgId, ct);
        if (thread is null) return NotFound(errorResponse("Thread not found."));
        try
        {
            await _actions.SetThreadReadAsync(id, UserId(), body.Read, ct);
            return NoContent();
        }
        catch (KeyNotFoundException) { return NotFound(errorResponse("Thread not found.")); }
        catch (InvalidOperationException ex) { return BadRequest(errorResponse(ex.Message)); }
    }

    [HttpPost("threads/{id:guid}/move")]
    public async Task<IActionResult> Move(Guid id, MoveThreadRequest body, CancellationToken ct)
    {
        var orgId = OrgId();
        var thread = await _db.MailThreads
            .Include(t => t.MailboxConnection)
            .FirstOrDefaultAsync(t => t.Id == id && t.MailboxConnection!.User!.OrganizationId == orgId, ct);
        if (thread is null) return NotFound(errorResponse("Thread not found."));
        try
        {
            await _actions.MoveThreadAsync(id, UserId(), body.Target, ct);
            return NoContent();
        }
        catch (KeyNotFoundException) { return NotFound(errorResponse("Thread not found.")); }
        catch (ArgumentException ex) { return BadRequest(errorResponse(ex.Message)); }
        catch (InvalidOperationException ex) { return BadRequest(errorResponse(ex.Message)); }
    }

    [HttpPost("mailboxes/{id:guid}/sync")]
    public async Task<IActionResult> TriggerSync(Guid id)
    {
        // Org-scoped, not owner-scoped: on a shared inbox anyone watching a mailbox
        // should be able to ask it to catch up. A sync only pulls; it cannot lose mail.
        if (!await MailboxInOrgAsync(id, OrgId())) return NotFound(errorResponse("Mailbox not found."));
        MailSyncJobs.TriggerIncremental(id);
        return Accepted();
    }

    // ---------- Attachments ----------

    /// <summary>
    /// Streams one attachment's bytes. Org-scoped through the owning message, the
    /// caller's own staged upload, or a draft in the caller's org (shared drafts),
    /// so an attachment id from another organization is indistinguishable from a
    /// missing one.
    /// </summary>
    [HttpGet("attachments/{id:guid}")]
    public async Task<IActionResult> DownloadAttachment(Guid id, CancellationToken ct)
    {
        var orgId = OrgId();

        var userId = UserId();
        var attachment = await _db.MailAttachments
            .Where(a => a.Id == id)
            .Select(a => new
            {
                a.FileName,
                a.ContentType,
                a.BlobKey,
                // Readable if it hangs off a message in the caller's org (shared inbox),
                // if it is the caller's own staged upload, or if it is bound to a
                // draft in the caller's org (shared draft).
                InOrg = a.Message != null && _db.MailboxConnections.Any(c =>
                    c.Id == a.Message.MailboxConnectionId && c.User!.OrganizationId == orgId),
                IsOwn = a.OwnerUserId == userId,
                DraftInOrg = a.Draft != null && _db.MailboxConnections.Any(c =>
                    c.Id == a.Draft.MailboxConnectionId && c.User!.OrganizationId == orgId)
            })
            .FirstOrDefaultAsync(ct);

        if (attachment is null || (!attachment.InOrg && !attachment.IsOwn && !attachment.DraftInOrg))
            return NotFound(errorResponse("Attachment not found."));

        var stream = _attachments.OpenRead(attachment.BlobKey);
        if (stream is null)
            return NotFound(errorResponse("Attachment content is no longer available."));

        // enableRangeProcessing lets the browser seek within audio/video and resume
        // an interrupted download instead of restarting it.
        return File(stream, attachment.ContentType ?? "application/octet-stream",
            attachment.FileName, enableRangeProcessing: true);
    }

    /// <summary>
    /// Stages an uploaded file for an outgoing message. Returns an id the caller passes
    /// back in <see cref="SendRequest.AttachmentIds"/> or binds through drafts. With
    /// <paramref name="draftId"/>, the upload binds to that org-scoped shared draft at
    /// once; otherwise the row stays unbound under the uploader until a draft claims it.
    /// </summary>
    [HttpPost("attachments")]
    [RequestSizeLimit(64 * 1024 * 1024)]
    [EnableRateLimiting(RateLimitPolicies.Upload)]
    public async Task<IActionResult> UploadAttachment(IFormFile file, [FromQuery] Guid? draftId, CancellationToken ct)
    {
        if (file is null || file.Length == 0)
            return BadRequest(errorResponse("No file was uploaded."));
        if (file.Length > _attachments.MaxBytes)
            return BadRequest(errorResponse(
                $"Attachment is too large. The limit is {_attachments.MaxBytes / (1024 * 1024)} MB."));

        MailDraft? draft = null;
        if (draftId is not null)
        {
            var orgId = OrgId();
            draft = await _db.MailDrafts
                .Include(d => d.MailboxConnection)
                .FirstOrDefaultAsync(d => d.Id == draftId
                    && d.MailboxConnection!.User!.OrganizationId == orgId, ct);
            if (draft is null) return NotFound(errorResponse("Draft not found."));
        }

        await using var stream = file.OpenReadStream();
        var (blobKey, size) = await _attachments.SaveAsync(stream, ct);

        var attachment = new MailAttachment
        {
            OwnerUserId = UserId(),
            DraftId = draft?.Id,
            FileName = MailIngestor.SanitizeFileName(file.FileName),
            ContentType = string.IsNullOrWhiteSpace(file.ContentType)
                ? "application/octet-stream"
                : file.ContentType,
            SizeBytes = size,
            BlobKey = blobKey
        };
        _db.MailAttachments.Add(attachment);
        await _db.SaveChangesAsync(ct);

        return Ok(new AttachmentDto(attachment.Id, attachment.FileName, attachment.ContentType,
            attachment.SizeBytes, false, null));
    }

    /// <summary>
    /// Discards a staged upload the user removed before sending. The caller must own
    /// the upload, or it must be bound to a draft in the caller's organization
    /// (shared drafts): a teammate can remove a file from a draft they can edit.
    /// </summary>
    [HttpDelete("attachments/{id:guid}")]
    public async Task<IActionResult> DeleteStagedAttachment(Guid id, CancellationToken ct)
    {
        var orgId = OrgId();
        var userId = UserId();
        var attachment = await _db.MailAttachments
            .FirstOrDefaultAsync(a => a.Id == id && a.MessageId == null
                && (a.OwnerUserId == userId
                    || (a.Draft != null && _db.MailboxConnections.Any(c =>
                        c.Id == a.Draft.MailboxConnectionId && c.User!.OrganizationId == orgId))), ct);
        if (attachment is null) return NotFound(errorResponse("Attachment not found."));

        _db.MailAttachments.Remove(attachment);
        await _db.SaveChangesAsync(ct);
        // The blob itself is left for the sweeper — another row may share the same hash.
        return NoContent();
    }

    [HttpGet("drafts")]
    public async Task<IActionResult> ListDrafts([FromQuery] Guid connectionId, CancellationToken ct)
    {
        try
        {
            var drafts = await _composer.ListDraftsAsync(UserId(), connectionId, ct);
            return Ok(drafts);
        }
        catch (KeyNotFoundException) { return NotFound(errorResponse("Mailbox not found.")); }
    }

    [HttpGet("drafts/{id:guid}")]
    public async Task<IActionResult> GetDraft(Guid id, CancellationToken ct)
    {
        var draft = await _composer.GetDraftAsync(UserId(), id, ct);
        return draft is null ? NotFound(errorResponse("Draft not found.")) : Ok(draft);
    }

    [HttpPost("drafts")]
    public async Task<IActionResult> UpsertDraft(DraftUpsertRequest body, CancellationToken ct)
    {
        try
        {
            var draft = await _composer.UpsertDraftAsync(UserId(), body, ct);
            return Ok(draft);
        }
        catch (KeyNotFoundException) { return NotFound(errorResponse("Mailbox not found.")); }
        catch (DraftGoneException ex) { return Conflict(new { error = ex.Message, code = "draft_gone" }); }
        catch (IdempotencyConflictException ex) { return Conflict(new { error = ex.Message, code = "draft_conflict" }); }
    }

    [HttpDelete("drafts/{id:guid}")]
    public async Task<IActionResult> DeleteDraft(Guid id, CancellationToken ct)
    {
        var removed = await _composer.DeleteDraftAsync(UserId(), id, ct);
        return removed ? NoContent() : NotFound(errorResponse("Draft not found."));
    }

    [HttpPost("send")]
    public async Task<IActionResult> Send(SendRequest body, CancellationToken ct)
    {
        try
        {
            return Ok(await _composer.SendAsync(UserId(), body, ct));
        }
        catch (KeyNotFoundException ex) { return NotFound(errorResponse(ex.Message)); }
        catch (DraftGoneException ex) { return Conflict(SendError(ex.Message, "draft_gone")); }
        catch (IdempotencyConflictException ex) { return Conflict(SendError(ex.Message, ex.Code)); }
        catch (UncertainDeliveryException ex) { return StatusCode(502, SendError(ex.Message, "uncertain")); }
        catch (SmtpNotSentException ex) { return StatusCode(502, SendError("Could not deliver the message: " + ex.Message, "not_sent")); }
        catch (InvalidOperationException ex) { return BadRequest(errorResponse(ex.Message)); }
        catch (Exception ex) when (ex is MailKit.Security.AuthenticationException
                                       or MailKit.Security.SslHandshakeException
                                       or MailKit.Net.Smtp.SmtpCommandException
                                       or MailKit.Net.Smtp.SmtpProtocolException
                                       or System.IO.IOException
                                       or System.Net.Sockets.SocketException)
        {
            return StatusCode(502, errorResponse("Could not deliver the message: " + ex.Message));
        }
    }

    private static object SendError(string message, string code) => new { error = message, code = code };

    // Phase 7: shared inbox — any org member can read from any mailbox in the org.
    // Write actions (sync, connect/disconnect, draft, send) still scope to the
    // caller's user id, so only the mailbox owner controls the connection.
    private async Task<bool> MailboxInOrgAsync(Guid connectionId, int orgId) =>
        await _db.MailboxConnections
            .Include(c => c.User)
            .AnyAsync(c => c.Id == connectionId && c.User!.OrganizationId == orgId);

    // Read from the signed token rather than re-querying the user on every request.
    private int OrgId() => this.CallerOrgId();

    private Guid UserId() => this.CallerId();

    private static object errorResponse(string message) => new { error = message };
}
