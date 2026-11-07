using Kompanion.Api.Auth;
using Kompanion.Api.Data;
using Kompanion.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Kompanion.Api.Controllers;

[ApiController, Authorize, Route("api/companies")]
public class ClientInsightsController(AppDbContext db) : ControllerBase
{
    [HttpGet("activity")]
    public async Task<IActionResult> Activity([FromQuery] int weeks = 8, CancellationToken ct = default)
    {
        if (weeks is < 1 or > 52) return BadRequest(new { error = "Weeks must be from 1 to 52." });
        var orgId = this.CallerOrgId();
        var now = DateTimeOffset.UtcNow;
        var today = SignalMetrics.BusinessDate(now);
        var monday = today.AddDays(-(((int)today.DayOfWeek + 6) % 7));
        var start = monday.AddDays(-7 * (weeks - 1));
        var since = new DateTimeOffset(start.ToDateTime(TimeOnly.MinValue), TimeSpan.FromHours(3)).ToUniversalTime();
        var companies = await db.Companies.AsNoTracking().Where(c => c.OrganizationId == orgId)
            .OrderBy(c => c.Name).Select(c => new { c.Id, c.Name, c.Domain, ProjectCount = c.Projects.Count }).ToListAsync(ct);
        var quarter = new DateOnly(today.Year, ((today.Month - 1) / 3) * 3 + 1, 1);
        var quarterEnd = quarter.AddMonths(3).AddDays(-1);
        var bookings = await db.ProjectFlights.AsNoTracking().Where(f => f.Project.Company.OrganizationId == orgId
                && f.StartDate <= quarterEnd && f.EndDate >= quarter)
            .GroupBy(f => f.Project.CompanyId).Select(g => new { Id = g.Key, Count = g.Count() }).ToDictionaryAsync(g => g.Id, g => g.Count, ct);
        var links = await Links(orgId).ToListAsync(ct);
        var threadIds = links.Select(l => l.ThreadId).Distinct().ToList();
        var threads = await db.MailThreads.AsNoTracking().Where(t => threadIds.Contains(t.Id)
                && t.MailboxConnection.User!.OrganizationId == orgId)
            .Select(t => new { t.Id, t.ReplyState }).ToListAsync(ct);
        var messages = await db.MailMessages.AsNoTracking().Where(m => m.ThreadId != null
                && threadIds.Contains(m.ThreadId.Value) && m.Folder.MailboxConnection.User!.OrganizationId == orgId
                && (m.InternalDate ?? m.MessageDate ?? m.FetchedAt) >= since
                && (m.InternalDate ?? m.MessageDate ?? m.FetchedAt) <= now)
            .Select(m => new { ThreadId = m.ThreadId!.Value, Date = m.InternalDate ?? m.MessageDate ?? m.FetchedAt })
            .ToListAsync(ct);
        var points = messages.Select(m => new { m.ThreadId, Week = (SignalMetrics.BusinessDate(m.Date).DayNumber - start.DayNumber) / 7 })
            .Distinct().ToList();
        return Ok(companies.Select(c =>
        {
            var ids = links.Where(l => l.CompanyId == c.Id).Select(l => l.ThreadId).ToHashSet();
            var waiting = threads.Count(t => ids.Contains(t.Id) && t.ReplyState == ReplyState.ToReply);
            return new
            {
                c.Id, c.Name, c.Domain, c.ProjectCount, ThreadCount = ids.Count, BoardsBooked = bookings.GetValueOrDefault(c.Id),
                WaitingCount = waiting, Status = waiting > 0 ? "WaitingOnUs" : "AllReplied",
                Weeks = Enumerable.Range(0, weeks).Select(i => new
                {
                    StartDate = start.AddDays(i * 7), Conversations = points.Count(p => p.Week == i && ids.Contains(p.ThreadId))
                })
            };
        }));
    }

    [HttpGet("{id:guid}/insights")]
    public async Task<IActionResult> Insights(Guid id, [FromQuery] DateOnly? startDate = null,
        [FromQuery] DateOnly? endDate = null, CancellationToken ct = default)
    {
        var orgId = this.CallerOrgId();
        if (!await db.Companies.AnyAsync(c => c.Id == id && c.OrganizationId == orgId, ct))
            return NotFound(new { error = "Company not found." });
        var now = DateTimeOffset.UtcNow;
        var today = SignalMetrics.BusinessDate(now);
        var quarter = new DateOnly(today.Year, ((today.Month - 1) / 3) * 3 + 1, 1);
        var start = startDate ?? quarter;
        var end = endDate ?? quarter.AddMonths(3).AddDays(-1);
        if (end < start || end.DayNumber - start.DayNumber > 365)
            return BadRequest(new { error = "Use an end date on or after start, within 366 days." });
        var ids = Links(orgId).Where(l => l.CompanyId == id).Select(l => l.ThreadId);
        var threads = db.MailThreads.AsNoTracking().Where(t => ids.Contains(t.Id)
            && t.MailboxConnection.User!.OrganizationId == orgId);
        var recent = await threads.OrderByDescending(t => t.LastDate.HasValue).ThenByDescending(t => t.LastDate).ThenBy(t => t.Id).Take(20)
            .Select(t => new { t.Id, t.Subject, t.Participants, t.Snippet, t.LastDate, t.HasUnread,
                ReplyState = t.ReplyState.ToString(), t.StateSince, t.NeedsNudge }).ToListAsync(ct);
        var since = now.AddDays(-30);
        var samples = await db.ThreadResponseTimes.AsNoTracking().Where(r => r.CompanyId == id
                && r.MailboxConnection.User!.OrganizationId == orgId && r.SentAt >= since && r.SentAt <= now)
            .Select(r => r.Seconds).ToListAsync(ct);
        return Ok(new
        {
            ClientId = id, StartDate = start, EndDate = end,
            BoardsBooked = await db.ProjectFlights.CountAsync(f => f.Project.CompanyId == id
                && f.Project.Company.OrganizationId == orgId && f.StartDate <= end && f.EndDate >= start, ct),
            FirstReply = new { Days = 30, Count = samples.Count, MedianSeconds = SignalMetrics.Median(samples) },
            LastContactAt = await threads.MaxAsync(t => t.LastDate, ct),
            ThreadCount = await threads.CountAsync(ct), WaitingCount = await threads.CountAsync(t => t.ReplyState == ReplyState.ToReply, ct),
            RecentThreads = recent
        });
    }

    // Union removes a thread linked both directly and through one or more projects.
    private IQueryable<ClientThreadLink> Links(int orgId) => db.ThreadCompanies
        .Where(l => l.Company.OrganizationId == orgId && l.Thread.MailboxConnection.User!.OrganizationId == orgId)
        .Select(l => new ClientThreadLink { CompanyId = l.CompanyId, ThreadId = l.ThreadId })
        .Union(db.ThreadProjects.Where(l => l.Project.Company.OrganizationId == orgId
                && l.Thread.MailboxConnection.User!.OrganizationId == orgId)
            .Select(l => new ClientThreadLink { CompanyId = l.Project.CompanyId, ThreadId = l.ThreadId }));

    private sealed class ClientThreadLink
    {
        public Guid CompanyId { get; init; }
        public Guid ThreadId { get; init; }
    }
}
