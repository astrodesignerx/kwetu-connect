using System.Security.Claims;
using System.Security.Cryptography;
using Kompanion.Api.Auth;
using Kompanion.Api.Data;
using Kompanion.Api.Models;
using Kompanion.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Kompanion.Api.Controllers;

/// <summary>
/// Admin oversight. Every query here is scoped to the caller's organization — an admin
/// administers their own org, not the deployment. Only one org exists today, but an
/// unscoped admin query is a hole the moment that stops being true, and it contradicts
/// the server-side-scoping rule the rest of the API follows.
/// </summary>
[ApiController]
[Route("api/admin")]
[Authorize(Roles = "Admin")]
public class AdminController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly AuditService _audit;
    private readonly TokenVersionCache _tokenVersions;

    public AdminController(AppDbContext db, AuditService audit, TokenVersionCache tokenVersions)
    {
        _db = db;
        _audit = audit;
        _tokenVersions = tokenVersions;
    }

    [HttpGet("users")]
    public async Task<IActionResult> Users()
    {
        var orgId = OrgId();
        var users = await _db.Users
            .Include(u => u.Mailboxes)
            .Where(u => u.OrganizationId == orgId)
            .OrderBy(u => u.CreatedAt)
            .ToListAsync();

        await Audit("admin.users.view", details: $"Viewed user list ({users.Count} users)");

        return Ok(users.Select(u => new AdminUserDto(
            u.Id, u.Email, u.Username, u.DisplayName, u.Role.ToString(),
            u.Mailboxes.Count, u.CreatedAt, u.LastLoginAt)));
    }

    [HttpPatch("users/{id:guid}/role")]
    public async Task<IActionResult> UpdateRole(Guid id, UpdateRoleRequest req)
    {
        if (!Enum.TryParse<UserRole>(req.Role, ignoreCase: true, out var newRole))
            return BadRequest(new { error = "Role must be 'Member' or 'Admin'." });

        var orgId = OrgId();
        var target = await _db.Users
            .Include(u => u.Mailboxes)
            .FirstOrDefaultAsync(u => u.Id == id && u.OrganizationId == orgId);
        if (target is null) return NotFound(new { error = "User not found." });

        // Count admins within this org only — a second org's admins must not make it
        // look safe to demote the last one here.
        if (target.Role == UserRole.Admin && newRole == UserRole.Member
            && await _db.Users.CountAsync(u => u.OrganizationId == orgId && u.Role == UserRole.Admin) == 1)
            return BadRequest(new { error = "Cannot demote the last remaining admin." });

        var oldRole = target.Role;
        var roleChanged = oldRole != newRole;
        target.Role = newRole;
        // The role travels as a JWT claim and [Authorize(Roles=…)] trusts it, so a
        // demotion that only wrote the row would leave the old admin holding admin
        // powers for the rest of the token's 7-day life. Bumping the token version
        // revokes every live session for that user; they sign in again with the new
        // role. Only bump when something actually changed, so a no-op PATCH doesn't
        // sign the user out.
        if (roleChanged) target.TokenVersion++;
        await _db.SaveChangesAsync();
        if (roleChanged) _tokenVersions.Invalidate(target.Id);

        await Audit("admin.user.role_change", targetUserId: target.Id, targetEmail: target.Email,
            details: $"{oldRole} -> {newRole}");

        return Ok(new AdminUserDto(target.Id, target.Email, target.Username, target.DisplayName,
            target.Role.ToString(), target.Mailboxes.Count, target.CreatedAt, target.LastLoginAt));
    }

    // ---------- Invitations ----------

    [HttpGet("invitations")]
    public async Task<IActionResult> Invitations()
    {
        var orgId = OrgId();
        var now = DateTimeOffset.UtcNow;
        var invitations = await _db.Invitations
            .Where(i => i.OrganizationId == orgId)
            .OrderByDescending(i => i.CreatedAt)
            .ToListAsync();

        return Ok(invitations.Select(i => ToDto(i, now)));
    }

    /// <summary>
    /// Issues an invitation. The raw token is returned exactly once — only its SHA-256
    /// is stored, so a database dump yields no working invite links.
    /// </summary>
    [HttpPost("invitations")]
    public async Task<IActionResult> CreateInvitation(CreateInvitationRequest req)
    {
        var email = (req.Email ?? "").Trim().ToLowerInvariant();
        if (!email.Contains('@'))
            return BadRequest(new { error = "A valid email address is required." });

        var role = UserRole.Member;
        if (!string.IsNullOrWhiteSpace(req.Role)
            && !Enum.TryParse(req.Role, ignoreCase: true, out role))
            return BadRequest(new { error = "Role must be 'Member' or 'Admin'." });

        var orgId = OrgId();
        if (await _db.Users.AnyAsync(u => u.Email == email && u.OrganizationId == orgId))
            return Conflict(new { error = "That person already has an account." });

        // Supersede any outstanding invite for the same address so only the newest link works.
        var now = DateTimeOffset.UtcNow;
        var outstanding = await _db.Invitations
            .Where(i => i.OrganizationId == orgId && i.Email == email
                        && i.AcceptedAt == null && i.RevokedAt == null)
            .ToListAsync();
        foreach (var old in outstanding) old.RevokedAt = now;

        var token = Convert.ToHexString(RandomNumberGenerator.GetBytes(32)).ToLowerInvariant();
        var invitation = new Invitation
        {
            OrganizationId = orgId,
            Email = email,
            TokenHash = AuthController.HashToken(token),
            Role = role,
            CreatedByUserId = CallerId(),
            CreatedAt = now,
            ExpiresAt = now.AddDays(7)
        };
        _db.Invitations.Add(invitation);
        await _db.SaveChangesAsync();

        await Audit("admin.invitation.create", targetEmail: email,
            details: $"Invited as {role}; expires {invitation.ExpiresAt:u}");

        return Ok(new CreateInvitationResponse(ToDto(invitation, now), token));
    }

    [HttpDelete("invitations/{id:guid}")]
    public async Task<IActionResult> RevokeInvitation(Guid id)
    {
        var orgId = OrgId();
        var invitation = await _db.Invitations
            .FirstOrDefaultAsync(i => i.Id == id && i.OrganizationId == orgId);
        if (invitation is null) return NotFound(new { error = "Invitation not found." });
        if (invitation.AcceptedAt is not null)
            return BadRequest(new { error = "That invitation has already been accepted." });

        invitation.RevokedAt = DateTimeOffset.UtcNow;
        await _db.SaveChangesAsync();

        await Audit("admin.invitation.revoke", targetEmail: invitation.Email);
        return NoContent();
    }

    // ---------- Oversight ----------

    // Oversight view of all mailbox connections in the organization. Metadata only —
    // credentials are never returned by any endpoint. Every call is audit-logged.
    [HttpGet("mailboxes")]
    public async Task<IActionResult> AllMailboxes()
    {
        var orgId = OrgId();
        var boxes = await _db.MailboxConnections
            .Include(m => m.User)
            .Where(m => m.User!.OrganizationId == orgId)
            .OrderBy(m => m.CreatedAt)
            .ToListAsync();

        await Audit("admin.mailboxes.view", details: $"Viewed all mailbox connections ({boxes.Count})");

        return Ok(boxes.Select(m => MailboxDto.From(m, includeOwner: true)));
    }

    [HttpGet("mailboxes/{id:guid}/threads")]
    public async Task<IActionResult> MailboxThreads(Guid id, [FromQuery] int page = 0, [FromQuery] int pageSize = 100)
    {
        var orgId = OrgId();
        var box = await _db.MailboxConnections.Include(c => c.User)
            .FirstOrDefaultAsync(c => c.Id == id && c.User!.OrganizationId == orgId);
        if (box is null) return NotFound(new { error = "Mailbox not found." });

        pageSize = Math.Clamp(pageSize, 1, 200);
        var total = await _db.MailThreads.CountAsync(t => t.MailboxConnectionId == id);
        var items = await _db.MailThreads.Where(t => t.MailboxConnectionId == id)
            .OrderByDescending(t => t.LastDate)
            .Skip(page * pageSize).Take(pageSize)
            .Select(t => new
            {
                t.Id, t.Subject, t.Participants, t.Snippet, t.MessageCount,
                t.FirstDate, t.LastDate, t.HasUnread, t.HasAttachments
            })
            .ToListAsync();

        await Audit("admin.mailbox.threads.view",
            targetUserId: box.UserId, targetEmail: box.User.Email,
            targetMailboxId: box.Id,
            details: $"Viewed threads of {box.Email} ({items.Count} of {total})");

        return Ok(new { total, items });
    }

    [HttpGet("threads/{id:guid}")]
    public async Task<IActionResult> Thread(Guid id)
    {
        var orgId = OrgId();
        var thread = await _db.MailThreads.Include(t => t.MailboxConnection).ThenInclude(c => c!.User)
            .FirstOrDefaultAsync(t => t.Id == id
                && t.MailboxConnection!.User!.OrganizationId == orgId);
        if (thread is null) return NotFound(new { error = "Thread not found." });

        var messages = await _db.MailMessages.Where(m => m.ThreadId == id)
            .OrderBy(m => m.MessageDate ?? m.InternalDate)
            .Select(m => new
            {
                m.Id, m.MessageId, m.FromAddr, m.FromName, m.ToAddrs, m.CcAddrs,
                m.Subject, m.MessageDate, m.Snippet, m.BodyText, m.BodyHtml,
                m.Flags, m.HasAttachments
            })
            .ToListAsync();

        await Audit("admin.thread.view",
            targetUserId: thread.MailboxConnection!.UserId,
            targetEmail: thread.MailboxConnection.User!.Email,
            targetMailboxId: thread.MailboxConnectionId,
            details: $"Viewed thread {thread.Id} of {thread.MailboxConnection.Email}");

        return Ok(new { thread, messages });
    }

    [HttpGet("audit-log")]
    public async Task<IActionResult> AuditLog()
    {
        // Audit entries carry no org column; scope through the actor instead so one
        // org's admin can't read another's oversight trail.
        var orgId = OrgId();
        var entries = await _db.AuditLogEntries
            .Where(a => _db.Users.Any(u => u.Id == a.ActorUserId && u.OrganizationId == orgId))
            .OrderByDescending(a => a.CreatedAt)
            .Take(200)
            .ToListAsync();

        return Ok(entries.Select(a => new AuditLogDto(
            a.Id, a.ActorEmail, a.Action, a.TargetEmail, a.TargetMailboxId, a.Details, a.CreatedAt)));
    }

    private static InvitationDto ToDto(Invitation i, DateTimeOffset now) =>
        new(i.Id, i.Email, i.Role.ToString(), i.CreatedAt, i.ExpiresAt,
            i.AcceptedAt, i.RevokedAt,
            i.AcceptedAt is not null ? "accepted"
            : i.RevokedAt is not null ? "revoked"
            : i.ExpiresAt <= now ? "expired"
            : "pending");

    private Guid CallerId() =>
        Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirstValue("sub")!);

    private int OrgId() => this.CallerOrgId();

    private async Task Audit(string action, Guid? targetUserId = null, string? targetEmail = null,
        Guid? targetMailboxId = null, string? details = null)
    {
        var email = User.FindFirstValue(ClaimTypes.Email) ?? "";
        await _audit.LogAsync(CallerId(), email, action, targetUserId, targetEmail, targetMailboxId, details);
    }
}
