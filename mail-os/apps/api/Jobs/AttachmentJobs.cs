using Kompanion.Api.Data;
using Kompanion.Api.Services.Mail;
using Hangfire;
using Microsoft.EntityFrameworkCore;

namespace Kompanion.Api.Jobs;

/// <summary>
/// Housekeeping for the attachment blob store.
///
/// Two things leak without this. A user who opens the compose window, attaches a file
/// and closes the tab leaves a staged row forever. And because blobs are content-addressed
/// and shared between rows, deleting a row can never delete its blob inline — the same
/// hash may back a dozen other messages.
/// </summary>
public class AttachmentJobs
{
    // Long enough that a slow compose is never interrupted, short enough that abandoned
    // uploads don't accumulate for weeks.
    private static readonly TimeSpan StagedUploadTtl = TimeSpan.FromDays(2);

    private readonly AppDbContext _db;
    private readonly AttachmentStore _store;
    private readonly ILogger<AttachmentJobs> _logger;

    public AttachmentJobs(AppDbContext db, AttachmentStore store, ILogger<AttachmentJobs> logger)
    {
        _db = db;
        _store = store;
        _logger = logger;
    }

    public const string SweepJobId = "attachment-sweep";

    public static void Schedule() =>
        RecurringJob.AddOrUpdate<AttachmentJobs>(
            SweepJobId,
            j => j.SweepAsync(CancellationToken.None),
            // 03:15 daily — off-peak for a Nairobi-hours team.
            "15 3 * * *");

    [AutomaticRetry(Attempts = 1)]
    public async Task SweepAsync(CancellationToken ct)
    {
        var cutoff = DateTimeOffset.UtcNow - StagedUploadTtl;

        // 1. Drop staged uploads that were never sent and never bound to a draft.
        var abandoned = await _db.MailAttachments
            .Where(a => a.MessageId == null && a.DraftId == null
                        && a.OwnerUserId != null && a.CreatedAt < cutoff)
            .ToListAsync(ct);

        if (abandoned.Count > 0)
        {
            _db.MailAttachments.RemoveRange(abandoned);
            await _db.SaveChangesAsync(ct);
            _logger.LogInformation("Attachment sweep: removed {Count} abandoned staged uploads", abandoned.Count);
        }

        // 2. Delete blobs no row references any more. Done as a second pass over the
        //    live key set rather than per-row, since keys are shared.
        var liveKeys = (await _db.MailAttachments
                .Select(a => a.BlobKey)
                .Distinct()
                .ToListAsync(ct))
            .ToHashSet(StringComparer.OrdinalIgnoreCase);

        var deleted = _store.DeleteUnreferenced(liveKeys);
        if (deleted > 0)
            _logger.LogInformation("Attachment sweep: deleted {Count} unreferenced blobs", deleted);
    }
}
