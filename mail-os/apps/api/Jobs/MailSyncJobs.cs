using Kompanion.Api.Services.Mail;
using Hangfire;

namespace Kompanion.Api.Jobs;

/// <summary>
/// Hangfire entry points for mailbox sync. Backfill runs once on connect; incremental
/// runs on a recurring schedule (polling fallback) and on IDLE wake-ups. The sync gate
/// inside MailIngestor dedupes concurrent runs for the same mailbox.
/// </summary>
public class MailSyncJobs
{
    private readonly MailIngestor _ingestor;

    public MailSyncJobs(MailIngestor ingestor) => _ingestor = ingestor;

    [AutomaticRetry(Attempts = 3, DelaysInSeconds = new[] { 60, 300, 900 })]
    public async Task BackfillMailboxAsync(Guid connectionId, CancellationToken ct) =>
        await _ingestor.SyncMailboxAsync(connectionId, ct);

    [AutomaticRetry(Attempts = 2, DelaysInSeconds = new[] { 60, 300 })]
    public async Task IncrementalSyncMailboxAsync(Guid connectionId, CancellationToken ct) =>
        await _ingestor.SyncMailboxAsync(connectionId, ct);

    public static string RecurringJobId(Guid connectionId) => $"mailbox-sync-{connectionId}";

    public static void ScheduleForMailbox(Guid connectionId)
    {
        BackgroundJob.Enqueue<MailSyncJobs>(j => j.BackfillMailboxAsync(connectionId, CancellationToken.None));
        RecurringJob.AddOrUpdate<MailSyncJobs>(
            RecurringJobId(connectionId),
            j => j.IncrementalSyncMailboxAsync(connectionId, CancellationToken.None),
            "*/5 * * * *");
    }

    public static void UnscheduleForMailbox(Guid connectionId) =>
        RecurringJob.RemoveIfExists(RecurringJobId(connectionId));

    public static void TriggerIncremental(Guid connectionId) =>
        BackgroundJob.Enqueue<MailSyncJobs>(j => j.IncrementalSyncMailboxAsync(connectionId, CancellationToken.None));
}
