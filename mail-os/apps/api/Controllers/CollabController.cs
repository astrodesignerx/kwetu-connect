using System.Security.Claims;
using Kompanion.Api.Auth;
using Kompanion.Api.Data;
using Kompanion.Api.Models;
using Kompanion.Api.Services.Mail;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Kompanion.Api.Controllers;

[ApiController]
[Authorize]
[Route("api")]
public class CollabController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly MailNotifier _notifier;

    public CollabController(AppDbContext db, MailNotifier notifier)
    {
        _db = db;
        _notifier = notifier;
    }

    private Guid UserId() => this.CallerId();

    // Read from the signed token rather than re-querying the user on every request.
    private int OrgId() => this.CallerOrgId();

    [HttpGet("org/members")]
    public async Task<IActionResult> ListMembers(CancellationToken ct)
    {
        var orgId = OrgId();
        var members = await _db.Users
            .Where(u => u.OrganizationId == orgId)
            .OrderBy(u => u.DisplayName)
            .Select(u => new OrgMemberDto(u.Id, u.Email, u.Username, u.DisplayName, u.Role.ToString()))
            .ToListAsync(ct);
        return Ok(members);
    }

    // ---------- Assignment ----------

    [HttpGet("threads/{threadId:guid}/assignment")]
    public async Task<IActionResult> GetAssignment(Guid threadId, CancellationToken ct)
    {
        var orgId = OrgId();
        var a = await _db.ThreadAssignments
            .Include(x => x.User)
            .Include(x => x.AssignedBy)
            .FirstOrDefaultAsync(x => x.ThreadId == threadId
                && _db.MailThreads
                    .Include(t => t.MailboxConnection)
                    .Any(t => t.Id == threadId && t.MailboxConnection!.User!.OrganizationId == orgId), ct);
        if (a is null) return NoContent();
        return Ok(new ThreadAssignmentDto(
            a.ThreadId, a.UserId, a.User.Email, a.User.DisplayName,
            a.AssignedByUserId, a.AssignedBy.Email, a.AssignedAt));
    }

    [HttpPost("threads/{threadId:guid}/assignment")]
    public async Task<IActionResult> Assign(Guid threadId, AssignRequest body, CancellationToken ct)
    {
        var orgId = OrgId();
        // Confirm the thread is in the org.
        var thread = await _db.MailThreads
            .Include(t => t.MailboxConnection)
            .FirstOrDefaultAsync(t => t.Id == threadId
                && t.MailboxConnection!.User!.OrganizationId == orgId, ct);
        if (thread is null) return NotFound(errorResponse("Thread not found."));

        var existing = await _db.ThreadAssignments.FirstOrDefaultAsync(a => a.ThreadId == threadId, ct);

        // The client sends the all-zeros GUID to mean "unassign". This has to be handled
        // BEFORE the assignee lookup below — Guid.Empty is never a real user, so falling
        // through would reject every unassign with "not a member of this organization".
        if (body.UserId == Guid.Empty)
        {
            if (existing is not null)
            {
                _db.ThreadAssignments.Remove(existing);
                await _db.SaveChangesAsync(ct);
            }
            await _notifier.NotifyAssignmentChangedAsync(orgId, thread.MailboxConnectionId, threadId, Guid.Empty);
            return NoContent();
        }

        // Confirm the assignee is a member of the same org.
        var assignee = await _db.Users.FirstOrDefaultAsync(u => u.Id == body.UserId && u.OrganizationId == orgId, ct);
        if (assignee is null) return BadRequest(errorResponse("Assignee is not a member of this organization."));

        // Upsert: one row per thread.
        if (existing is null)
        {
            _db.ThreadAssignments.Add(new ThreadAssignment
            {
                ThreadId = threadId,
                UserId = body.UserId,
                AssignedByUserId = UserId(),
                AssignedAt = DateTimeOffset.UtcNow
            });
        }
        else
        {
            existing.UserId = body.UserId;
            existing.AssignedByUserId = UserId();
            existing.AssignedAt = DateTimeOffset.UtcNow;
        }
        await _db.SaveChangesAsync(ct);

        var dto = new ThreadAssignmentDto(
            threadId, assignee.Id, assignee.Email, assignee.DisplayName,
            UserId(), (await _db.Users.FindAsync(UserId()))?.Email ?? "",
            DateTimeOffset.UtcNow);
        // Push live update so other open clients refetch threads.
        await _notifier.NotifyAssignmentChangedAsync(orgId, thread.MailboxConnectionId, threadId, body.UserId);
        return Ok(dto);
    }

    // ---------- Notes ----------

    [HttpGet("threads/{threadId:guid}/notes")]
    public async Task<IActionResult> ListNotes(Guid threadId, CancellationToken ct)
    {
        var orgId = OrgId();
        var thread = await _db.MailThreads
            .Include(t => t.MailboxConnection)
            .FirstOrDefaultAsync(t => t.Id == threadId
                && t.MailboxConnection!.User!.OrganizationId == orgId, ct);
        if (thread is null) return NotFound(errorResponse("Thread not found."));

        var notes = await _db.ThreadNotes
            .Include(n => n.Author)
            .Where(n => n.ThreadId == threadId)
            .OrderBy(n => n.CreatedAt)
            .Select(n => new NoteDto(
                n.Id, n.ThreadId, n.AuthorUserId, n.Author.Email, n.Author.DisplayName,
                n.Body, n.CreatedAt, n.UpdatedAt))
            .ToListAsync(ct);
        return Ok(notes);
    }

    [HttpPost("threads/{threadId:guid}/notes")]
    public async Task<IActionResult> CreateNote(Guid threadId, NoteUpsertRequest body, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(body.Body))
            return BadRequest(errorResponse("Note body is required."));
        var orgId = OrgId();
        var thread = await _db.MailThreads
            .Include(t => t.MailboxConnection)
            .FirstOrDefaultAsync(t => t.Id == threadId
                && t.MailboxConnection!.User!.OrganizationId == orgId, ct);
        if (thread is null) return NotFound(errorResponse("Thread not found."));

        var note = new ThreadNote
        {
            ThreadId = threadId,
            AuthorUserId = UserId(),
            Body = body.Body.Trim()
        };
        _db.ThreadNotes.Add(note);
        await _db.SaveChangesAsync(ct);

        var author = await _db.Users.FindAsync(UserId());
        var dto = new NoteDto(note.Id, note.ThreadId, note.AuthorUserId,
            author?.Email ?? "", author?.DisplayName ?? "",
            note.Body, note.CreatedAt, note.UpdatedAt);
        await _notifier.NotifyNotesChangedAsync(orgId, threadId);
        return Ok(dto);
    }

    [HttpDelete("notes/{id:guid}")]
    public async Task<IActionResult> DeleteNote(Guid id, CancellationToken ct)
    {
        var orgId = OrgId();
        // The owning User must be included explicitly — without it the org check below
        // reads null and every delete 404s, author or not.
        var note = await _db.ThreadNotes
            .Include(n => n.Thread).ThenInclude(t => t.MailboxConnection).ThenInclude(c => c!.User)
            .FirstOrDefaultAsync(n => n.Id == id, ct);
        if (note is null) return NotFound(errorResponse("Note not found."));

        // Scope before authorization so a note in another org is indistinguishable
        // from one that doesn't exist.
        if (note.Thread.MailboxConnection?.User?.OrganizationId != orgId)
            return NotFound(errorResponse("Note not found."));

        if (note.AuthorUserId != UserId())
        {
            // Only the author (or admin) can delete. Admins can always delete.
            var caller = await _db.Users.FindAsync(UserId());
            if (caller?.Role != UserRole.Admin)
                return Forbid();
        }

        var threadId = note.ThreadId;
        _db.ThreadNotes.Remove(note);
        await _db.SaveChangesAsync(ct);
        await _notifier.NotifyNotesChangedAsync(orgId, threadId);
        return NoContent();
    }

    private static object errorResponse(string message) => new { error = message };
}
