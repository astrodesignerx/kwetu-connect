using System.Security.Claims;
using Kompanion.Api.Auth;
using Kompanion.Api.Data;
using Kompanion.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Kompanion.Api.Controllers;

[ApiController]
[Authorize]
[Route("api")]
public sealed class WorkspaceOverviewController(AppDbContext db, AuditService audit) : ControllerBase
{
    [HttpGet("workspace/overview")]
    public async Task<IActionResult> Overview(CancellationToken ct)
    {
        var orgId = this.CallerOrgId();
        var now = DateTimeOffset.UtcNow;
        var since = now.AddDays(-30);
        var workspace = await db.Organizations.Where(o => o.Id == orgId)
            .Select(o => new { o.Name }).SingleOrDefaultAsync(ct);
        if (workspace is null) return NotFound();
        var boxes = db.MailboxConnections.Where(m => m.User.OrganizationId == orgId && m.IsActive);
        var health = await boxes.GroupBy(m => m.SyncState)
            .Select(g => new { State = g.Key, Count = g.Count() }).ToListAsync(ct);
        int Count(MailboxSyncState state) => health.Where(g => g.State == state).Sum(g => g.Count);
        int? pending = null;
        if (User.IsInRole("Admin"))
        {
            pending = await db.Invitations.CountAsync(i => i.OrganizationId == orgId
                && i.AcceptedAt == null && i.RevokedAt == null && i.ExpiresAt > now, ct);
            await Audit("admin.workspace.overview");
        }
        return Ok(new
        {
            workspaceName = workspace.Name,
            memberCount = await db.Users.CountAsync(u => u.OrganizationId == orgId, ct),
            mailboxCount = health.Sum(g => g.Count),
            templateCount = await db.EmailTemplates.CountAsync(t => t.OrganizationId == orgId, ct),
            sendsLast30Days = await db.SendOperations.CountAsync(s => s.Caller.OrganizationId == orgId
                && s.MailboxConnection.User.OrganizationId == orgId
                && s.Status == SendOperationStatus.Accepted && s.UpdatedAt >= since && s.UpdatedAt <= now, ct),
            pendingInvitations = pending,
            mailboxHealth = new { healthy = Count(MailboxSyncState.Syncing), pending = Count(MailboxSyncState.Pending),
                backfilling = Count(MailboxSyncState.Backfilling), needsAttention = Count(MailboxSyncState.Error) }
        });
    }

    [HttpGet("mailboxes/{id:guid}/sync-stats")]
    public async Task<IActionResult> SyncStats(Guid id, [FromQuery] int hours = 24, CancellationToken ct = default)
    {
        if (hours is < 1 or > 168) return BadRequest(new { error = "Hours must be between 1 and 168." });
        var orgId = this.CallerOrgId();
        var callerId = this.CallerId();
        var box = await db.MailboxConnections.AsNoTracking().FirstOrDefaultAsync(m => m.Id == id
            && m.UserId == callerId && m.User.OrganizationId == orgId, ct);
        if (box is null) return NotFound(new { error = "Mailbox not found." });
        var now = DateTimeOffset.UtcNow;
        var endHour = new DateTimeOffset(now.Year, now.Month, now.Day, now.Hour, 0, 0, TimeSpan.Zero);
        var start = endHour.AddHours(1 - hours);
        // Bucket in memory: the provider cannot translate UtcDateTime.Date/Hour, and the window is at most a week.
        var fetched = await db.MailMessages.Where(m => m.MailboxConnectionId == id && m.FetchedAt >= start && m.FetchedAt <= now)
            .Select(m => m.FetchedAt).ToListAsync(ct);
        var counts = fetched.GroupBy(t => new { t.UtcDateTime.Date, t.UtcDateTime.Hour })
            .Select(g => new { g.Key.Date, g.Key.Hour, Count = g.Count() }).ToList();
        var hourly = Enumerable.Range(0, hours).Select(index =>
        {
            var hour = start.AddHours(index);
            return new { hour, count = counts.Where(c => c.Date == hour.UtcDateTime.Date && c.Hour == hour.Hour).Sum(c => c.Count) };
        }).ToArray();
        return Ok(new
        {
            mailboxId = id, syncState = box.SyncState.ToString(), box.SyncError, box.LastSyncCompletedAt,
            conversationCount = await db.MailThreads.CountAsync(t => t.MailboxConnectionId == id, ct),
            messagesSynced = hourly.Sum(h => h.count), hourly,
            errorCount24Hours = (int?)null
        });
    }

    [HttpGet("admin/audit-log/daily")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> DailyAudit([FromQuery] int weeks = 12, CancellationToken ct = default)
    {
        if (weeks is < 1 or > 52) return BadRequest(new { error = "Weeks must be between 1 and 52." });
        var orgId = this.CallerOrgId();
        var today = DateTimeOffset.UtcNow.Date;
        var start = new DateTimeOffset(today.AddDays(-((int)today.DayOfWeek + 6) % 7 - (weeks - 1) * 7), TimeSpan.Zero);
        var end = new DateTimeOffset(today.AddDays(1), TimeSpan.Zero);
        // Bucket in memory for the same translation reason as sync stats.
        var created = await db.AuditLogEntries.Where(a => a.CreatedAt >= start && a.CreatedAt < end
                && db.Users.Any(u => u.Id == a.ActorUserId && u.OrganizationId == orgId))
            .Select(a => a.CreatedAt).ToListAsync(ct);
        var counts = created.GroupBy(t => t.UtcDateTime.Date)
            .Select(g => new { Date = g.Key, Count = g.Count() }).ToList();
        var days = Enumerable.Range(0, (today - start.UtcDateTime.Date).Days + 1)
            .Select(i => start.AddDays(i).UtcDateTime.Date)
            .Select(day => new { date = day.ToString("yyyy-MM-dd"), count = counts.Where(c => c.Date == day).Sum(c => c.Count) });
        await Audit("admin.audit.daily.view");
        return Ok(new { today = today.ToString("yyyy-MM-dd"), weeks, days });
    }

    private Task Audit(string action) => audit.LogAsync(this.CallerId(),
        User.FindFirstValue(ClaimTypes.Email) ?? "", action);
}
