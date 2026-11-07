using Hangfire;
using Kompanion.Api.Data;
using Microsoft.EntityFrameworkCore;

namespace Kompanion.Api.Jobs;

public class FollowUpJobs(AppDbContext db)
{
    public const string JobId = "signal-follow-up";

    public static void Schedule() => RecurringJob.AddOrUpdate<FollowUpJobs>(JobId,
        job => job.MarkNeedsNudgeAsync(CancellationToken.None), "0 4 * * *");

    public Task<int> MarkNeedsNudgeAsync(CancellationToken ct) => MarkNeedsNudgeAtAsync(DateTimeOffset.UtcNow, ct);

    internal Task<int> MarkNeedsNudgeAtAsync(DateTimeOffset now, CancellationToken ct) =>
        db.MailThreads.Where(t => t.ReplyState == ReplyState.Awaiting && !t.NeedsNudge && t.StateSince < now.AddDays(-3))
            .ExecuteUpdateAsync(set => set.SetProperty(t => t.NeedsNudge, true), ct);
}
