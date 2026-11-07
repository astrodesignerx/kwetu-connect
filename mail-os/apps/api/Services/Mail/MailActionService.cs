using Kompanion.Api.Data;
using Kompanion.Api.Jobs;
using Microsoft.EntityFrameworkCore;

namespace Kompanion.Api.Services.Mail;

/// <summary>
/// Two-way write-back for read state and thread moves. Each action holds the
/// per-mailbox gate before snapshotting messages, opens every source folder it
/// touches (the Inbox included), and checks the server's current UIDVALIDITY
/// before applying stored UIDs, so an identifier reset can never target a
/// different message. Local rows change only for server operations that actually
/// succeeded, committed per folder so a later failure or cancellation keeps the
/// confirmed work.
/// </summary>
public class MailActionService
{
    private readonly AppDbContext _db;
    private readonly IMailSessionFactory _sessions;
    private readonly MailboxSyncGate _gate;
    private readonly ThreadingService _threading;
    private readonly MailNotifier _notifier;
    private readonly ILogger<MailActionService> _logger;

    public MailActionService(AppDbContext db, IMailSessionFactory sessions, MailboxSyncGate gate,
        ThreadingService threading, MailNotifier notifier, ILogger<MailActionService> logger)
    {
        _db = db;
        _sessions = sessions;
        _gate = gate;
        _threading = threading;
        _notifier = notifier;
        _logger = logger;
    }

    public async Task SetThreadReadAsync(Guid threadId, Guid userId, bool read, CancellationToken ct)
    {
        var thread = await LoadThreadInOrgAsync(threadId, userId, ct)
            ?? throw new KeyNotFoundException("Thread not found.");
        var connection = thread.MailboxConnection!;

        using var lease = await _gate.EnterAsync(connection.Id, ct);
        if (!await _db.MailThreads.AnyAsync(t => t.Id == threadId, ct))
            throw new KeyNotFoundException("Thread not found.");

        // Snapshots are taken under the gate: no sync can insert, move or delete
        // rows between the snapshot and the server action.
        var messages = await _db.MailMessages
            .Where(m => m.ThreadId == threadId)
            .Select(m => new { m.Id, m.FolderId, m.Uid, m.UidValidity })
            .ToListAsync(ct);
        if (messages.Count == 0) return;

        var folders = await _db.MailboxFolders
            .Where(f => messages.Select(m => m.FolderId).Distinct().Contains(f.Id))
            .ToListAsync(ct);

        await using var session = await _sessions.ConnectAsync(connection, ct);

        var errors = new List<string>();
        var confirmed = 0;
        var cancelled = false;
        foreach (var folder in folders)
        {
            var uids = messages.Where(m => m.FolderId == folder.Id).Select(m => m.Uid).ToList();
            if (uids.Count == 0) continue;
            try
            {
                await using var remote = await OpenFolderOrThrowAsync(session, folder.FullName, ct);
                if (remote.UidValidity != folder.UidValidity)
                {
                    TriggerReconciliation(connection.Id);
                    throw new InvalidOperationException(
                        $"UIDs in '{folder.FullName}' are stale (UIDVALIDITY changed); re-syncing before retry.");
                }
                await remote.SetSeenAsync(uids, read, ct);
            }
            catch (OperationCanceledException)
            {
                cancelled = true;
                break;
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Set-read failed for folder {Folder} ({Mailbox})",
                    folder.FullName, connection.Email);
                errors.Add($"{folder.FullName}: {ex.Message}");
                continue;
            }

            // Commit each confirmed folder immediately: a later folder failing or
            // the request being cancelled must not roll back server state that
            // already happened. Bounded local write, independent of the request token.
            var folderRows = await _db.MailMessages
                .Where(m => m.ThreadId == threadId && m.FolderId == folder.Id)
                .ToListAsync(CancellationToken.None);
            foreach (var m in folderRows)
            {
                var flags = new HashSet<string>(m.Flags);
                if (read) flags.Add("Seen"); else flags.Remove("Seen");
                m.Flags = flags.ToArray();
            }
            await _db.SaveChangesAsync(CancellationToken.None);
            confirmed++;
        }

        // Derived from persisted state, after the confirmed writes above.
        thread.HasUnread = await _db.MailMessages
            .Where(m => m.ThreadId == threadId)
            .AnyAsync(m => !m.Flags.Contains("Seen"), CancellationToken.None);
        await _db.SaveChangesAsync(CancellationToken.None);
        await _notifier.NotifyThreadsChangedAsync(userId, connection.Id);

        if (cancelled) throw new OperationCanceledException();
        if (errors.Count > 0)
            throw new InvalidOperationException(
                $"Marked {confirmed} of {folders.Count} folder(s) as {(read ? "read" : "unread")}; failures: {string.Join("; ", errors)}");
    }

    public async Task MoveThreadAsync(Guid threadId, Guid userId, string targetSpecialUse, CancellationToken ct)
    {
        if (targetSpecialUse is not ("Archive" or "Trash"))
            throw new ArgumentException("Target must be 'Archive' or 'Trash'.");

        var thread = await LoadThreadInOrgAsync(threadId, userId, ct)
            ?? throw new KeyNotFoundException("Thread not found.");
        var connection = thread.MailboxConnection!;

        using var lease = await _gate.EnterAsync(connection.Id, ct);
        if (!await _db.MailThreads.AnyAsync(t => t.Id == threadId, ct))
            throw new KeyNotFoundException("Thread not found.");

        var messages = await _db.MailMessages
            .Where(m => m.ThreadId == threadId)
            .Select(m => new { m.Id, m.FolderId, m.Uid, m.UidValidity })
            .ToListAsync(ct);
        if (messages.Count == 0) return;

        var target = await _db.MailboxFolders
            .FirstOrDefaultAsync(f => f.MailboxConnectionId == connection.Id
                && f.SpecialUse == (targetSpecialUse == "Trash" ? FolderSpecialUse.Trash : FolderSpecialUse.Archive), ct);
        if (target is null)
            throw new InvalidOperationException($"No '{targetSpecialUse}' folder found on the server.");

        var folders = await _db.MailboxFolders
            .Where(f => messages.Select(m => m.FolderId).Distinct().Contains(f.Id))
            .ToListAsync(ct);

        await using var session = await _sessions.ConnectAsync(connection, ct);

        // Archive preservation depends on the server reporting moved UIDs. Refuse
        // before anything moves when the server cannot guarantee that mapping,
        // rather than orphaning the thread afterwards.
        if (targetSpecialUse == "Archive" && !session.SupportsMoveMapping)
            throw new InvalidOperationException(
                $"Cannot move to '{target.FullName}': the server does not report moved message IDs, " +
                "so the thread cannot be preserved. Move it in another client instead.");

        // Opening the destination first fails fast when it is gone, before any
        // source folder is touched. It is selected only for the open itself and
        // disposed immediately; the move resolves it by name afterwards, so sources
        // stay selected for their own moves.
        uint targetValidity;
        await using (var targetRemote = await OpenFolderOrThrowAsync(session, target.FullName, ct))
        {
            targetValidity = targetRemote.UidValidity;
        }

        // Moving a folder into itself is a no-op, not a delete and not a rebuild:
        // the rows are already where they belong.
        var work = folders.Where(f => f.Id != target.Id).ToList();
        if (work.Count == 0) return;

        if (target.UidValidity != targetValidity
            && await _db.MailMessages.AnyAsync(m => m.FolderId == target.Id, ct))
        {
            TriggerReconciliation(connection.Id);
            throw new InvalidOperationException(
                $"UIDs in '{target.FullName}' changed; re-sync the destination before retrying the move.");
        }

        var preserveArchive = targetSpecialUse == "Archive";
        var errors = new List<string>();
        var moved = 0;
        var rebuilt = false;
        var cancelled = false;
        foreach (var folder in work)
        {
            var group = messages.Where(m => m.FolderId == folder.Id).ToList();
            if (group.Count == 0) continue;
            IReadOnlyDictionary<uint, uint>? map = null;
            try
            {
                await using var remote = await OpenFolderOrThrowAsync(session, folder.FullName, ct);
                if (remote.UidValidity != folder.UidValidity)
                {
                    TriggerReconciliation(connection.Id);
                    throw new InvalidOperationException(
                        $"UIDs in '{folder.FullName}' are stale (UIDVALIDITY changed); re-syncing before retry.");
                }
                map = await remote.MoveToAsync(group.Select(m => m.Uid).ToList(), target.FullName, ct);
            }
            catch (OperationCanceledException)
            {
                cancelled = true;
                break;
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Move failed for folder {Folder} ({Mailbox})",
                    folder.FullName, connection.Email);
                errors.Add($"{folder.FullName}: {ex.GetType().Name}: {ex.Message}");
                continue;
            }

            // Confirmed on the server: reconcile locally now, before the next folder.
            if (preserveArchive)
            {
                await using var lookup = await OpenFolderOrThrowAsync(session, target.FullName, ct);
                var repointed = 0;
                var rows = await _db.MailMessages
                    .Where(m => group.Select(g => g.Id).Contains(m.Id))
                    .ToListAsync(CancellationToken.None);
                foreach (var row in rows)
                {
                    uint newUid;
                    if (map is not null && map.TryGetValue(row.Uid, out newUid))
                    {
                        // Mapped: exact server-reported UID.
                    }
                    else if (!string.IsNullOrEmpty(row.MessageId)
                        && await lookup.FindUidByMessageIdAsync(row.MessageId, CancellationToken.None) is { } found)
                    {
                        // Unmapped but reconciled: the destination copy found by
                        // Message-ID before anything local is replaced.
                        newUid = found;
                    }
                    else
                    {
                        // Neither mapped nor found: keep the row and report, instead
                        // of deleting thread metadata for a copy we cannot prove.
                        errors.Add($"{folder.FullName}: moved on the server but the copy in '{target.FullName}' was not found.");
                        continue;
                    }
                    row.FolderId = target.Id;
                    row.Uid = newUid;
                    row.UidValidity = targetValidity;
                    repointed++;
                }
                if (target.UidValidity != targetValidity)
                {
                    // The target generation turned over: rows under the old
                    // generation can never match the server again, so they go in
                    // the same atomic save instead of lingering as phantoms.
                    var oldValidity = target.UidValidity;
                    target.UidValidity = targetValidity;
                    await _db.MailMessages
                        .Where(m => m.FolderId == target.Id && m.UidValidity == oldValidity)
                        .ExecuteDeleteAsync(CancellationToken.None);
                }
                await _db.SaveChangesAsync(CancellationToken.None);
                moved += repointed;
                if (repointed != group.Count && errors.Count == 0)
                    errors.Add($"{folder.FullName}: {group.Count - repointed} message(s) could not be reconciled.");
            }
            else
            {
                // Trash is destructive-local by design (it is excluded from sync, so
                // there is nothing to reconcile against): drop the confirmed rows.
                var ids = group.Select(m => m.Id).ToList();
                await _db.MailMessages.Where(m => ids.Contains(m.Id)).ExecuteDeleteAsync(CancellationToken.None);
                await _threading.RebuildAsync(connection.Id, CancellationToken.None);
                rebuilt = true;
                moved += group.Count;
            }
        }

        if (!rebuilt)
        {
            // Mapped Archive moves need no rebuild: the thread row never changed.
            // Counts are refreshed from the surviving rows in case the stored
            // aggregates drifted.
            thread.MessageCount = await _db.MailMessages
                .CountAsync(m => m.ThreadId == threadId, CancellationToken.None);
            thread.HasUnread = await _db.MailMessages
                .Where(m => m.ThreadId == threadId)
                .AnyAsync(m => !m.Flags.Contains("Seen"), CancellationToken.None);
            await _db.SaveChangesAsync(CancellationToken.None);
        }
        await _notifier.NotifyThreadsChangedAsync(userId, connection.Id);
        TriggerReconciliation(connection.Id);

        if (cancelled) throw new OperationCanceledException();
        if (errors.Count > 0)
            throw new InvalidOperationException(
                $"Moved {moved} of {messages.Count} message(s); {errors.Count} folder(s) failed: {string.Join("; ", errors)}");
    }

    /// <summary>
    /// Resolves a thread for a caller who is in the same organization as the mailbox
    /// that holds it, not only for the mailbox's owner. Actions run through the
    /// owning connection's stored credentials; they just no longer require the
    /// caller to be that owner.
    /// </summary>
    private async Task<MailThread?> LoadThreadInOrgAsync(Guid threadId, Guid userId, CancellationToken ct)
    {
        var orgId = await _db.Users
            .Where(u => u.Id == userId)
            .Select(u => (int?)u.OrganizationId)
            .FirstOrDefaultAsync(ct);
        if (orgId is null) return null;

        return await _db.MailThreads
            .Include(t => t.MailboxConnection)
            .ThenInclude(c => c!.User)
            .FirstOrDefaultAsync(
                t => t.Id == threadId && t.MailboxConnection!.User!.OrganizationId == orgId, ct);
    }

    private static async Task<IMailFolderSession> OpenFolderOrThrowAsync(
        IMailSession session, string fullName, CancellationToken ct)
    {
        try
        {
            return await session.OpenFolderAsync(fullName, readWrite: true, ct);
        }
        catch (OperationCanceledException) { throw; }
        catch (Exception ex)
        {
            throw new InvalidOperationException($"Cannot open '{fullName}': {ex.Message}", ex);
        }
    }

    /// <summary>
    /// Asks the polling job to reconcile soon. Best effort: a scheduling failure
    /// must not mask the domain error the caller is about to receive.
    /// </summary>
    private void TriggerReconciliation(Guid connectionId)
    {
        try
        {
            MailSyncJobs.TriggerIncremental(connectionId);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Could not enqueue reconciliation sync for mailbox {Id}.", connectionId);
        }
    }
}
