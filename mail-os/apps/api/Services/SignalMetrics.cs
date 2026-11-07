using Kompanion.Api.Data;
using Kompanion.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace Kompanion.Api.Services;

public class SignalMetrics(AppDbContext db)
{
    // Reporting dates use Nairobi business dates. Durations remain elapsed seconds.
    public static DateOnly BusinessDate(DateTimeOffset time) => DateOnly.FromDateTime(time.ToOffset(TimeSpan.FromHours(3)).DateTime);

    public static List<DateOnly> WorkingDates(DateTimeOffset now, int count)
    {
        var dates = new List<DateOnly>();
        for (var date = BusinessDate(now); dates.Count < count; date = date.AddDays(-1))
            if (date.DayOfWeek is not (DayOfWeek.Saturday or DayOfWeek.Sunday)) dates.Add(date);
        dates.Reverse();
        return dates;
    }

    public static double? Median(IEnumerable<double> values)
    {
        var sorted = values.Order().ToArray();
        if (sorted.Length == 0) return null;
        var middle = sorted.Length / 2;
        return sorted.Length % 2 == 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
    }

    public async Task<MailBriefDto> BriefAsync(int orgId, Guid userId, DateTimeOffset now, CancellationToken ct)
    {
        var threads = db.MailThreads.AsNoTracking().Where(t => t.MailboxConnection.IsActive
            && t.MailboxConnection.User!.OrganizationId == orgId);
        var waiting = await threads.Where(t => t.ReplyState == ReplyState.ToReply
            && (db.ThreadAssignments.Any(a => a.ThreadId == t.Id && a.UserId == userId)
                || (!db.ThreadAssignments.Any(a => a.ThreadId == t.Id) && t.MailboxConnection.UserId == userId)))
            .OrderBy(t => t.StateSince)
            .Select(t => new { t.Id, t.Subject, t.StateSince, t.NeedsNudge }).ToListAsync(ct);
        var unread = await db.MailMessages.CountAsync(m => m.Folder.SpecialUse == FolderSpecialUse.Inbox
            && !m.Flags.Contains("Seen") && m.Folder.MailboxConnection.IsActive
            && m.Folder.MailboxConnection.User!.OrganizationId == orgId, ct);
        var today = BusinessDate(now);
        var end = today.AddDays(7);
        var flights = await db.ProjectFlights.AsNoTracking()
            .Where(f => f.Project.Company.OrganizationId == orgId && f.StartDate >= today && f.StartDate < end)
            .OrderBy(f => f.StartDate).ThenBy(f => f.SiteName)
            .Select(f => new UpcomingFlightDto(f.Id, f.ProjectId, f.SiteName, f.Project.CompanyId,
                f.Project.Company.Name, f.StartDate, f.EndDate)).ToListAsync(ct);
        var dates = WorkingDates(now, 7);
        var start = new DateTimeOffset(dates[0].ToDateTime(TimeOnly.MinValue), TimeSpan.FromHours(3)).ToUniversalTime();
        var rows = await db.ThreadResponseTimes.AsNoTracking()
            .Where(r => r.MailboxConnection.User!.OrganizationId == orgId && r.SentAt >= start && r.SentAt <= now)
            .Select(r => new { r.SentAt, r.Seconds }).ToListAsync(ct);
        var included = rows.Where(r => dates.Contains(BusinessDate(r.SentAt))).ToList();
        var daily = dates.Select(date =>
        {
            var samples = included.Where(r => BusinessDate(r.SentAt) == date).Select(r => r.Seconds).ToList();
            return new ResponseDayDto(date, samples.Count, Median(samples));
        }).ToList();
        return new MailBriefDto(unread,
            waiting.Select(t => new WaitingThreadDto(t.Id, t.Subject, t.StateSince,
                Math.Max(0, (now - t.StateSince).TotalSeconds), t.NeedsNudge)).ToList(),
            await threads.CountAsync(t => t.ReplyState == ReplyState.Awaiting, ct), flights,
            new FirstReplyDto(7, included.Count, Median(included.Select(r => r.Seconds)), daily));
    }

    public async Task<ResponseTimesDto> ResponseTimesAsync(int orgId, string by, int days, DateTimeOffset now, CancellationToken ct)
    {
        var since = now.AddDays(-days);
        var rows = await db.ThreadResponseTimes.AsNoTracking()
            .Where(r => r.MailboxConnection.User!.OrganizationId == orgId && r.SentAt >= since && r.SentAt <= now)
            .Select(r => new { r.UserId, UserName = r.User.DisplayName, r.CompanyId,
                ClientName = r.Company == null ? "Unlinked" : r.Company.Name, r.Seconds }).ToListAsync(ct);
        var groups = rows.GroupBy(r => by == "client" ? r.CompanyId : (Guid?)r.UserId)
            .Select(g => new ResponseGroupDto(g.Key, by == "client" ? g.First().ClientName : g.First().UserName,
                g.Count(), Median(g.Select(r => r.Seconds))!.Value)).OrderBy(g => g.Name).ToList();
        return new ResponseTimesDto(by, days, rows.Count, Median(rows.Select(r => r.Seconds)), groups);
    }
}
