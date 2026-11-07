using System.Text.Json;
using System.Text.RegularExpressions;
using Kompanion.Api.Data;
using Microsoft.EntityFrameworkCore;
using MimeKit;

namespace Kompanion.Api.Services.Mail;

/// <summary>
/// Syncs one mailbox connection from the IMAP server into Postgres. Ported from the
/// Phase 0 spike with its hard-won behaviors intact: flag snapshot + \Seen restore
/// (this Dovecot host marks bodies read on fetch), UIDVALIDITY reset handling, and
/// special-use folder detection with Trash/Junk/spam exclusion.
/// Safe to re-run any time — inserts are deduped by (connection, folder, uidvalidity, uid).
///
/// Local rows are reconciled against a complete server UID set: messages deleted or
/// moved away in another client disappear locally on the next sync, including when
/// a folder becomes empty. Reconciliation never runs on a failed or partial fetch.
/// A folder that cannot be synced is recorded honestly as an <see cref="MailboxSyncState.Error"/>
/// rather than a false success; the existing Hangfire and IDLE jobs retry later.
/// </summary>
public class MailIngestor
{
    private readonly AppDbContext _db;
    private readonly IMailSessionFactory _sessions;
    private readonly ThreadingService _threading;
    private readonly MailNotifier _notifier;
    private readonly MailboxSyncGate _gate;
    private readonly AttachmentStore _attachments;
    private readonly ILogger<MailIngestor> _logger;

    public MailIngestor(AppDbContext db, IMailSessionFactory sessions,
        ThreadingService threading, MailNotifier notifier, MailboxSyncGate gate,
        AttachmentStore attachments, ILogger<MailIngestor> logger)
    {
        _db = db;
        _sessions = sessions;
        _threading = threading;
        _notifier = notifier;
        _gate = gate;
        _attachments = attachments;
        _logger = logger;
    }

    public record BackfillResult(string Mailbox, int Stored, int Failed);

    /// <summary>
    /// Re-fetches attachment content for messages synced before the blob store existed.
    /// Those rows have HasAttachments set and filename metadata but no stored bytes.
    ///
    /// Only the affected UIDs are fetched, and the original \Seen state is restored
    /// afterwards — this host marks messages read the moment a body is fetched, and a
    /// maintenance command must not silently mark someone's inbox as read.
    /// </summary>
    public async Task<BackfillResult> BackfillAttachmentsAsync(Guid connectionId, CancellationToken ct)
    {
        var connection = await _db.MailboxConnections
            .FirstOrDefaultAsync(c => c.Id == connectionId, ct)
            ?? throw new KeyNotFoundException("Mailbox connection not found.");

        var pending = await _db.MailMessages
            .Where(m => m.MailboxConnectionId == connectionId && m.HasAttachments && !m.Attachments.Any())
            .Select(m => new { m.Id, m.FolderId, m.Uid, m.UidValidity, m.Flags })
            .ToListAsync(ct);

        if (pending.Count == 0) return new BackfillResult(connection.Email, 0, 0);

        var folders = await _db.MailboxFolders
            .Where(f => pending.Select(p => p.FolderId).Distinct().Contains(f.Id))
            .ToListAsync(ct);

        var stored = 0;
        var failed = 0;

        using var lease = await _gate.EnterAsync(connectionId, ct);
        await using var session = await _sessions.ConnectAsync(connection, ct);
        foreach (var folder in folders)
        {
            var inFolder = pending.Where(p => p.FolderId == folder.Id).ToList();
            if (inFolder.Count == 0) continue;

            IMailFolderSession remote;
            try
            {
                remote = await session.OpenFolderAsync(folder.FullName, readWrite: true, ct);
            }
            catch (Exception ex)
            {
                _logger.LogWarning("Backfill cannot open {Folder}: {Message}", folder.FullName, ex.Message);
                failed += inFolder.Count;
                continue;
            }

            await using (remote)
            {
                // UIDVALIDITY moved: these UIDs no longer identify the same messages.
                if (remote.UidValidity != folder.UidValidity)
                {
                    _logger.LogWarning("Backfill skipping {Folder}: UIDVALIDITY changed", folder.FullName);
                    failed += inFolder.Count;
                    continue;
                }

                foreach (var row in inFolder)
                {
                    try
                    {
                        var mime = await remote.GetMessageAsync(row.Uid, ct);
                        var message = await _db.MailMessages.FirstAsync(m => m.Id == row.Id, ct);
                        await StoreAttachmentsAsync(mime, message, ct);

                        // These have to be added to the set explicitly. MailAttachment.Id
                        // is initialised to Guid.NewGuid(), so when EF discovers a new row
                        // through a navigation on an already-tracked parent it sees a
                        // populated key, assumes the row exists, and emits UPDATE — which
                        // matches nothing and throws a concurrency exception. During normal
                        // ingest the parent message is itself Added, so the whole graph is
                        // inserted and the problem never appears.
                        foreach (var attachment in message.Attachments)
                            _db.Entry(attachment).State = EntityState.Added;

                        await _db.SaveChangesAsync(ct);
                        stored += message.Attachments.Count;
                    }
                    catch (OperationCanceledException) { throw; }
                    catch (Exception ex)
                    {
                        _logger.LogWarning(ex, "Backfill failed for uid {Uid} ({Type})",
                            row.Uid, ex.GetType().Name);
                        failed++;
                    }
                }

                // Fetching a body sets \Seen on this host; put it back where it was.
                // Bounded: even a stuck server must not hang backfill cleanup.
                using var restoreCts = new CancellationTokenSource(TimeSpan.FromSeconds(30));
                try
                {
                    var wasUnseen = inFolder
                        .Where(p => !p.Flags.Contains("Seen"))
                        .Select(p => p.Uid)
                        .ToList();
                    if (wasUnseen.Count > 0)
                        await remote.SetSeenAsync(wasUnseen, read: false, restoreCts.Token);
                }
                catch (OperationCanceledException) when (ct.IsCancellationRequested) { throw; }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Backfill could not restore unread state in {Folder}", folder.FullName);
                }
            }
        }

        return new BackfillResult(connection.Email, stored, failed);
    }

    /// <summary>
    /// Writes each attachment's bytes into the blob store and records a row on the
    /// message. Covers both real attachments and <c>cid:</c>-referenced inline images,
    /// so the reading pane can resolve embedded images instead of showing a broken icon.
    /// A failure on one part never aborts the message — mail arrives however the sender
    /// built it, and a single unreadable part should not cost the whole message.
    /// </summary>
    private async Task StoreAttachmentsAsync(MimeMessage mime, MailMessage message, CancellationToken ct)
    {
        foreach (var entity in mime.BodyParts)
        {
            if (entity is not MimePart part) continue;

            var isInline = !part.IsAttachment && !string.IsNullOrEmpty(part.ContentId);
            // Text parts without a content id are the message body itself, not attachments.
            if (!part.IsAttachment && !isInline) continue;
            if (isInline && part is TextPart) continue;

            var extension = MimeTypes.TryGetExtension(part.ContentType?.MimeType ?? "", out var ext) ? ext : ".bin";
            var fileName = part.FileName
                ?? part.ContentDisposition?.FileName
                ?? part.ContentType?.Name
                ?? $"attachment-{message.Attachments.Count + 1}{extension}";

            try
            {
                using var buffer = new MemoryStream();
                await part.Content.DecodeToAsync(buffer, ct);
                if (buffer.Length == 0) continue;
                if (buffer.Length > _attachments.MaxBytes)
                {
                    _logger.LogWarning(
                        "Skipping attachment {Name} ({Size} bytes) on uid {Uid}: over the {Max}-byte store limit",
                        fileName, buffer.Length, message.Uid, _attachments.MaxBytes);
                    continue;
                }

                buffer.Position = 0;
                var (blobKey, size) = await _attachments.SaveAsync(buffer, ct);

                message.Attachments.Add(new MailAttachment
                {
                    FileName = SanitizeFileName(fileName),
                    ContentType = part.ContentType?.MimeType,
                    SizeBytes = size,
                    ContentId = string.IsNullOrEmpty(part.ContentId) ? null : part.ContentId.Trim('<', '>'),
                    IsInline = isInline,
                    BlobKey = blobKey
                });
            }
            catch (OperationCanceledException) { throw; }
            catch (Exception ex)
            {
                _logger.LogWarning("Could not store attachment {Name} on uid {Uid}: {Message}",
                    fileName, message.Uid, ex.Message);
            }
        }

        message.HasAttachments = message.Attachments.Any(a => !a.IsInline);
    }

    /// <summary>
    /// Strips directory separators and control characters from a sender-supplied
    /// filename. The name is echoed back in a Content-Disposition header on download,
    /// so it must not carry path segments or header-breaking characters.
    /// </summary>
    internal static string SanitizeFileName(string name)
    {
        // Take the last path segment rather than stripping separators in place —
        // "../../etc/passwd" must become "passwd", not "etcpasswd".
        var baseName = name.Split('/', '\\').LastOrDefault() ?? name;

        var cleaned = new string(baseName
            .Where(c => !char.IsControl(c) && c != '"')
            .ToArray())
            .Trim()
            .TrimStart('.');

        if (cleaned.Length == 0) cleaned = "attachment";
        return cleaned.Length <= 200 ? cleaned : cleaned[^200..];
    }

    public async Task SyncMailboxAsync(Guid connectionId, CancellationToken ct)
    {
        if (!await _gate.TryEnterAsync(connectionId, ct))
        {
            _logger.LogDebug("Sync already in progress for mailbox {Id}; skipping", connectionId);
            return;
        }
        try
        {
            await SyncMailboxCoreAsync(connectionId, ct);
        }
        finally
        {
            _gate.Release(connectionId);
        }
    }

    private async Task SyncMailboxCoreAsync(Guid connectionId, CancellationToken ct)
    {
        var connection = await _db.MailboxConnections
            .FirstOrDefaultAsync(c => c.Id == connectionId && c.IsActive, ct);
        if (connection is null) return;

        if (connection.SyncState is MailboxSyncState.Pending or MailboxSyncState.Error)
            connection.SyncState = MailboxSyncState.Backfilling;
        await _db.SaveChangesAsync(ct);
        await _notifier.NotifySyncStateAsync(connection);

        IMailSession session;
        try
        {
            session = await _sessions.ConnectAsync(connection, ct);
        }
        catch (OperationCanceledException)
        {
            await FailAsync(connection, "Sync cancelled before it started, retrying automatically.",
                CancellationToken.None);
            throw;
        }
        catch (Exception ex)
        {
            connection.SyncState = MailboxSyncState.Error;
            connection.SyncError = ex is MailKit.Security.AuthenticationException
                ? "Mailbox credentials were rejected — reconnect the mailbox with the current password."
                : $"Cannot reach {connection.ImapHost}:{connection.ImapPort} — {ex.Message}";
            await _db.SaveChangesAsync(CancellationToken.None);
            await _notifier.NotifySyncStateAsync(connection);
            // Auth failures won't fix themselves on retry; network errors may.
            if (ex is not MailKit.Security.AuthenticationException) throw;
            return;
        }

        try
        {
            await using (session)
            {
            IReadOnlyList<RemoteFolderDescriptor> remoteFolders;
            try
            {
                remoteFolders = await session.ListFoldersAsync(ct);
            }
            catch (OperationCanceledException) { throw; }
            catch (Exception ex)
            {
                await FailAsync(connection,
                    $"Could not list folders on {connection.ImapHost}, {ex.Message}", ct);
                return;
            }

            await DiscoverFoldersAsync(remoteFolders, connection, ct);

            var folders = await _db.MailboxFolders
                .Where(f => f.MailboxConnectionId == connection.Id && !f.IsExcluded)
                .ToListAsync(ct);
            var failures = new List<string>();
            foreach (var folder in folders)
            {
                try
                {
                    // A failed generation replacement clears rolled-back tracking.
                    // Reload later folders before continuing so their saves persist.
                    if (_db.Entry(folder).State == EntityState.Detached)
                    {
                        _db.MailboxFolders.Attach(folder);
                        await _db.Entry(folder).ReloadAsync(ct);
                    }
                    await SyncFolderAsync(session, connection, folder, ct);
                }
                catch (OperationCanceledException) { throw; }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Folder sync failed: {Folder} ({Mailbox})",
                        folder.FullName, connection.Email);
                    failures.Add($"{folder.FullName}: {ex.Message}");
                }
            }

            if (failures.Count > 0)
            {
                // A moved message may have vanished from its source while the
                // destination fetch failed. Keep thread metadata until every
                // folder is reconciled, rather than deleting an apparent orphan.
                await FailAsync(connection,
                    $"Could not sync {failures.Count} folder(s): {string.Join("; ", failures)}", ct);
                return;
            }

            try
            {
                await _threading.RebuildAsync(connection.Id, ct);
            }
            catch (OperationCanceledException) { throw; }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Thread rebuild failed ({Mailbox})", connection.Email);
                await FailAsync(connection,
                    $"Synced {folders.Count} folder(s) but threads could not be rebuilt, {ex.Message}", ct);
                return;
            }

            connection.SyncState = MailboxSyncState.Syncing;
            connection.SyncError = null;
            connection.LastSyncCompletedAt = DateTimeOffset.UtcNow;
            await _db.SaveChangesAsync(ct);
            await _notifier.NotifySyncStateAsync(connection);
            await _notifier.NotifyThreadsChangedAsync(connection.UserId, connection.Id);
            }
        }
        catch (OperationCanceledException)
        {
            // Cancellation is not success: persist a recoverable Error with cleanup
            // that does not depend on the cancelled token, then rethrow.
            await FailAsync(connection, "Sync cancelled before completion, retrying automatically.",
                CancellationToken.None);
            throw;
        }
        catch (Exception ex)
        {
            // Unexpected failures must not strand the mailbox in Backfilling:
            // record an honest, recoverable Error with token-independent cleanup,
            // then rethrow so the job pipeline can retry.
            await FailAsync(connection, $"Sync failed, {ex.Message}. Retrying automatically.",
                CancellationToken.None);
            throw;
        }
    }

    private async Task FailAsync(MailboxConnection connection, string error, CancellationToken ct)
    {
        connection.SyncState = MailboxSyncState.Error;
        connection.SyncError = error;
        await _db.SaveChangesAsync(ct);
        await _notifier.NotifySyncStateAsync(connection);
    }

    private async Task DiscoverFoldersAsync(
        IReadOnlyList<RemoteFolderDescriptor> remote, MailboxConnection connection, CancellationToken ct)
    {
        foreach (var group in remote.GroupBy(f => f.FullName))
        {
            var f = group.First();
            var specialUse = DetectSpecialUse(f);
            var excluded = specialUse is FolderSpecialUse.Trash or FolderSpecialUse.Junk
                || f.FullName.Contains("spam", StringComparison.OrdinalIgnoreCase)
                || f.NoSelect;

            var entity = await _db.MailboxFolders.FirstOrDefaultAsync(
                x => x.MailboxConnectionId == connection.Id && x.FullName == f.FullName, ct);
            if (entity is null)
            {
                entity = new MailboxFolder { MailboxConnectionId = connection.Id, FullName = f.FullName };
                _db.MailboxFolders.Add(entity);
            }
            entity.SpecialUse = specialUse;
            entity.IsExcluded = excluded;
        }
        await _db.SaveChangesAsync(ct);
    }

    private static FolderSpecialUse DetectSpecialUse(RemoteFolderDescriptor folder)
    {
        if (folder.IsInbox) return FolderSpecialUse.Inbox;
        if (folder.HasSent) return FolderSpecialUse.Sent;
        if (folder.HasDrafts) return FolderSpecialUse.Drafts;
        if (folder.HasTrash) return FolderSpecialUse.Trash;
        if (folder.HasJunk) return FolderSpecialUse.Junk;
        if (folder.HasArchive) return FolderSpecialUse.Archive;

        var name = folder.FullName;
        if (name.Equals("INBOX", StringComparison.OrdinalIgnoreCase)) return FolderSpecialUse.Inbox;
        if (name.Contains("sent", StringComparison.OrdinalIgnoreCase)) return FolderSpecialUse.Sent;
        if (name.Contains("draft", StringComparison.OrdinalIgnoreCase)) return FolderSpecialUse.Drafts;
        if (name.Contains("trash", StringComparison.OrdinalIgnoreCase)) return FolderSpecialUse.Trash;
        if (name.Contains("junk", StringComparison.OrdinalIgnoreCase)
            || name.Contains("spam", StringComparison.OrdinalIgnoreCase)) return FolderSpecialUse.Junk;
        if (name.Contains("archive", StringComparison.OrdinalIgnoreCase)) return FolderSpecialUse.Archive;
        return FolderSpecialUse.None;
    }

    private async Task SyncFolderAsync(IMailSession session, MailboxConnection connection,
        MailboxFolder folderEntity, CancellationToken ct)
    {
        // The folder is always opened (the Inbox included) before stored UIDs are
        // applied to anything.
        await using var remote = await session.OpenFolderAsync(folderEntity.FullName, readWrite: true, ct);
        var validityChanged = remote.UidValidity != folderEntity.UidValidity;

        // The complete server UID set. Every destructive step below runs only after
        // both of these calls succeeded, never on a failed or partial snapshot.
        var uids = await remote.SearchAllAsync(ct);
        var summaries = await remote.FetchSummariesAsync(uids, ct);
        var byUid = summaries.ToDictionary(s => s.Uid);

        var missing = uids.Where(u => !byUid.ContainsKey(u)).ToList();
        if (missing.Count > 0)
            throw new InvalidOperationException(
                $"Incomplete FETCH in '{folderEntity.FullName}': {missing.Count} message(s) have no summary.");

        if (validityChanged)
        {
            _logger.LogWarning("UIDVALIDITY changed for {Folder} ({Old} -> {New}); resyncing folder",
                folderEntity.FullName, folderEntity.UidValidity, remote.UidValidity);
            await ReplaceGenerationAsync(remote, connection, folderEntity, uids, byUid, ct);
            return;
        }

        // Messages deleted or moved away in another client (or an emptied folder)
        // disappear locally. The snapshot above completed, so this delete is safe.
        var serverUids = uids.ToHashSet();
        await _db.MailMessages
            .Where(m => m.FolderId == folderEntity.Id
                && m.UidValidity == folderEntity.UidValidity
                && !serverUids.Contains(m.Uid))
            .ExecuteDeleteAsync(ct);

        if (uids.Count == 0)
        {
            folderEntity.LastUid = null;
            folderEntity.LastSyncedAt = DateTimeOffset.UtcNow;
            await _db.SaveChangesAsync(ct);
            return;
        }

        var attemptedNew = new List<uint>();
        Exception? restoreError = null;
        try
        {
            await IngestNewAsync(remote, connection, folderEntity, uids, byUid, attemptedNew, ct);
        }
        finally
        {
            restoreError = await RestoreUnseenAsync(remote, folderEntity.FullName, byUid, attemptedNew);
        }

        if (restoreError is not null)
            throw new InvalidOperationException(
                $"Ingested '{folderEntity.FullName}' but could not restore unread state: {restoreError.Message}",
                restoreError);
    }

    /// <summary>
    /// Restores unread state for attempted body fetches. Bounded to the UIDs this
    /// folder attempted, on a bounded token independent of the request: even a
    /// stuck server must not hang sync cleanup forever.
    /// </summary>
    private async Task<Exception?> RestoreUnseenAsync(IMailFolderSession remote, string folderName,
        Dictionary<uint, RemoteMessageSummary> byUid, List<uint> attemptedNew)
    {
        using var restoreCts = new CancellationTokenSource(TimeSpan.FromSeconds(30));
        try
        {
            var unseenNew = attemptedNew
                .Where(u => byUid.TryGetValue(u, out var s) && !s.Flags.Contains("Seen"))
                .ToList();
            if (unseenNew.Count > 0)
                await remote.SetSeenAsync(unseenNew, read: false, restoreCts.Token);
            return null;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Could not restore unread state in {Folder}", folderName);
            return ex;
        }
    }

    /// <summary>
    /// Replaces one UIDVALIDITY generation with the next: the new rows are staged
    /// first, and the superseded rows (with their cached bodies) are deleted only
    /// after every replacement body fetch succeeded. A body failure rolls the whole
    /// replacement back, so the prior cache and thread metadata survive intact with
    /// no phantom tracked rows left behind.
    /// </summary>
    private async Task ReplaceGenerationAsync(IMailFolderSession remote, MailboxConnection connection,
        MailboxFolder folderEntity, IReadOnlyList<uint> uids,
        Dictionary<uint, RemoteMessageSummary> byUid, CancellationToken ct)
    {
        var oldValidity = folderEntity.UidValidity;
        folderEntity.UidValidity = remote.UidValidity;
        folderEntity.LastUid = null;

        var attemptedNew = new List<uint>();
        Exception? restoreError = null;
        await using var tx = await _db.Database.BeginTransactionAsync(ct);
        try
        {
            if (uids.Count > 0)
                await IngestNewAsync(remote, connection, folderEntity, uids, byUid, attemptedNew, ct);
            await _db.MailMessages
                .Where(m => m.FolderId == folderEntity.Id && m.UidValidity == oldValidity)
                .ExecuteDeleteAsync(ct);
            await _db.SaveChangesAsync(ct);
            await tx.CommitAsync(ct);
        }
        catch
        {
            await tx.RollbackAsync(CancellationToken.None);
            _db.ChangeTracker.Clear();
            // The clear above detaches everything, including the connection whose
            // Error state the caller is about to record: re-track it.
            _db.MailboxConnections.Attach(connection);
            throw;
        }
        finally
        {
            restoreError = await RestoreUnseenAsync(remote, folderEntity.FullName, byUid, attemptedNew);
        }

        if (restoreError is not null)
            throw new InvalidOperationException(
                $"Ingested '{folderEntity.FullName}' but could not restore unread state: {restoreError.Message}",
                restoreError);
    }

    private async Task IngestNewAsync(IMailFolderSession remote, MailboxConnection connection,
        MailboxFolder folderEntity, IReadOnlyList<uint> uids,
        Dictionary<uint, RemoteMessageSummary> byUid, List<uint> attemptedNew, CancellationToken ct)
    {
        var existing = await _db.MailMessages
            .Where(m => m.FolderId == folderEntity.Id && m.UidValidity == folderEntity.UidValidity)
            .Select(m => new { m.Id, m.Uid, m.Flags, m.MessageId })
            .ToListAsync(ct);
        var existingByUid = existing.ToDictionary(e => e.Uid);

        // One message can occupy two UIDs in the same folder: a host may file its own
        // copy of an outgoing message in addition to the one the send flow appends,
        // and server-side copies do the same. Deduplicating on Message-ID keeps the
        // row count, and therefore unread state, search hits and attachments —
        // honest without dropping either copy's bytes.
        var seenMessageIds = existing
            .Where(e => !string.IsNullOrEmpty(e.MessageId))
            .Select(e => e.MessageId!)
            .ToHashSet(StringComparer.Ordinal);

        var newMessages = new List<MailMessage>();
        var contactSeeds = new List<ContactSeed>();
        var duplicates = 0;
        var fetchFailures = 0;

        foreach (var uid in uids)
        {
            var summary = byUid[uid];
            var flags = summary.Flags;

            if (existingByUid.TryGetValue(uid, out var row))
            {
                // Flag reconciliation for already-synced messages (two-way read state).
                // Compared order-insensitively: the server is free to return keywords
                // in a different order between sessions, and an order-sensitive compare
                // turned that into a write (and a "flags changed" event) on every sync.
                if (!FlagsEqual(row.Flags, flags))
                {
                    var rowId = row.Id;
                    await _db.MailMessages.Where(m => m.Id == rowId)
                        .ExecuteUpdateAsync(s => s.SetProperty(m => m.Flags, flags), ct);
                }
                continue;
            }

            // Read from the envelope, so a duplicate costs no body fetch, and, just
            // as importantly, never sets \Seen on the server for a copy we discard.
            if (!string.IsNullOrEmpty(summary.MessageId) && !seenMessageIds.Add(summary.MessageId))
            {
                duplicates++;
                continue;
            }

            attemptedNew.Add(uid);
            try
            {
                var mime = await remote.GetMessageAsync(uid, ct);
                var message = MessageMapper.Map(mime, summary, connection.Id, folderEntity.Id,
                    uid, folderEntity.UidValidity, contactSeeds);
                // Blobs are written before the row is saved; EF persists the rows in
                // message.Attachments alongside the message via the navigation property.
                await StoreAttachmentsAsync(mime, message, ct);
                newMessages.Add(message);
            }
            catch (OperationCanceledException) { throw; }
            catch (Exception ex)
            {
                fetchFailures++;
                _logger.LogWarning("Fetch failed for uid {Uid} in {Folder}: {Message}",
                    uid, folderEntity.FullName, ex.Message);
            }

            if (newMessages.Count >= 100)
            {
                _db.MailMessages.AddRange(newMessages);
                await _db.SaveChangesAsync(ct);
                newMessages.Clear();
            }
        }
        if (newMessages.Count > 0)
        {
            _db.MailMessages.AddRange(newMessages);
            await _db.SaveChangesAsync(ct);
        }

        if (duplicates > 0)
        {
            _logger.LogInformation(
                "Skipped {Count} duplicate message(s) in {Folder}: same Message-ID already stored under another UID",
                duplicates, folderEntity.FullName);
        }

        // A failed body fetch leaves a half-ingested folder: the message is missing
        // locally while the server copy may now be marked read. That is an honest
        // sync failure, not a success.
        if (fetchFailures > 0)
            throw new InvalidOperationException(
                $"Could not fetch {fetchFailures} message(s) in '{folderEntity.FullName}'.");

        await UpsertContactsAsync(connection, contactSeeds, ct);

        folderEntity.LastUid = uids.Max();
        folderEntity.LastSyncedAt = DateTimeOffset.UtcNow;
        await _db.SaveChangesAsync(ct);
    }

    private async Task UpsertContactsAsync(MailboxConnection connection, List<ContactSeed> seeds, CancellationToken ct)
    {
        if (seeds.Count == 0) return;
        var orgId = connection.User?.OrganizationId
            ?? (await _db.Users.Where(u => u.Id == connection.UserId).Select(u => u.OrganizationId).FirstAsync(ct));

        foreach (var group in seeds.GroupBy(s => s.Email.ToLowerInvariant()))
        {
            var email = group.Key;
            var best = group.OrderByDescending(s => s.When).First();
            var contact = await _db.Contacts
                .FirstOrDefaultAsync(c => c.OrganizationId == orgId && c.Email == email, ct);
            if (contact is null)
            {
                _db.Contacts.Add(new Contact
                {
                    OrganizationId = orgId,
                    Email = email,
                    Name = best.Name,
                    LastSeenAt = best.When,
                    MessageCount = group.Count()
                });
            }
            else
            {
                if (best.When > contact.LastSeenAt)
                {
                    contact.LastSeenAt = best.When;
                    if (!string.IsNullOrEmpty(best.Name)) contact.Name = best.Name;
                }
                contact.MessageCount += group.Count();
            }
        }
        await _db.SaveChangesAsync(ct);
    }

    /// <summary>
    /// Set equality for flag arrays. The server may return the same flags in a different
    /// order between sessions; comparing as sequences turned that into a database write
    /// on every sync.
    /// </summary>
    private static bool FlagsEqual(string[] stored, string[] fetched) =>
        stored.Length == fetched.Length
        && stored.OrderBy(f => f, StringComparer.Ordinal)
            .SequenceEqual(fetched.OrderBy(f => f, StringComparer.Ordinal));

    private sealed record ContactSeed(string Email, string? Name, DateTimeOffset When);

    /// <summary>
    /// Builds a preview line the same way ingest does, so the backfill command can
    /// regenerate snippets for messages that were stored before the HTML handling
    /// was fixed. One implementation, two callers.
    /// </summary>
    internal static string? BuildSnippet(string? bodyText, string? bodyHtml) =>
        MessageMapper.MakeSnippet(bodyText ?? MessageMapper.StripHtml(bodyHtml));

    // Stays private: BuildSnippet above is a member of MailIngestor, so it can reach in.
    private static class MessageMapper
    {
        private static readonly Regex HtmlTag = new("<[^>]+>", RegexOptions.Compiled);
        private static readonly Regex Whitespace = new(@"\s+", RegexOptions.Compiled);

        // <style> and <script> bodies are not tags, so stripping tags alone leaves their
        // contents behind — HTML-only mail was producing snippets that opened with
        // "body{margin:0;padding:24px;background:#FEFBD2…" instead of the message.
        private static readonly Regex NonContentBlock = new(
            @"<(style|script|head)\b[^>]*>.*?</\1\s*>",
            RegexOptions.Compiled | RegexOptions.IgnoreCase | RegexOptions.Singleline);

        public static string? NormalizeId(string? id)
        {
            if (string.IsNullOrWhiteSpace(id)) return null;
            var t = id.Trim();
            if (t.StartsWith('<') && t.EndsWith('>')) t = t[1..^1];
            t = t.Trim();
            return t.Length == 0 ? null : t;
        }

        public static MailMessage Map(MimeMessage mime, RemoteMessageSummary summary,
            Guid connectionId, Guid folderId, uint uid, uint uidValidity,
            List<ContactSeed> contactSeeds)
        {
            var references = mime.References
                .Select(NormalizeId)
                .Where(s => s is not null)
                .Cast<string>()
                .Distinct()
                .ToArray();

            var from = mime.From?.Mailboxes.FirstOrDefault();
            var date = mime.Date == default ? (DateTimeOffset?)null : mime.Date;

            if (from is not null)
                contactSeeds.Add(new ContactSeed(from.Address, from.Name, date ?? DateTimeOffset.UtcNow));
            foreach (var mb in mime.To?.Mailboxes ?? Enumerable.Empty<MailboxAddress>())
                contactSeeds.Add(new ContactSeed(mb.Address, mb.Name, date ?? DateTimeOffset.UtcNow));

            var attachments = mime.Attachments.ToList();
            var attachmentMeta = attachments.Select(a => new
            {
                name = a.ContentDisposition?.FileName ?? (a as MimePart)?.FileName ?? a.ContentType?.Name,
                contentType = a.ContentType?.MimeType
            }).ToList();

            return new MailMessage
            {
                MailboxConnectionId = connectionId,
                FolderId = folderId,
                Uid = uid,
                UidValidity = uidValidity,
                MessageId = NormalizeId(mime.MessageId),
                InReplyTo = NormalizeId(mime.InReplyTo),
                HeaderReferences = references,
                Subject = mime.Subject,
                NormalizedSubject = ThreadBuilder.NormalizeSubject(mime.Subject),
                FromName = from?.Name,
                FromAddr = from?.Address,
                ToAddrs = Flatten(mime.To),
                CcAddrs = Flatten(mime.Cc),
                MessageDate = date?.ToUniversalTime(),
                InternalDate = summary.InternalDate?.ToUniversalTime(),
                Snippet = MakeSnippet(mime.TextBody ?? StripHtml(mime.HtmlBody)),
                BodyText = mime.TextBody,
                BodyHtml = mime.HtmlBody,
                Flags = summary.Flags,
                SizeBytes = summary.Size,
                HasAttachments = attachments.Count > 0,
                AttachmentMetaJson = attachmentMeta.Count > 0 ? JsonSerializer.Serialize(attachmentMeta) : null
            };
        }

        private static string? Flatten(InternetAddressList? list)
        {
            if (list is null) return null;
            var parts = list.Mailboxes.Select(mb =>
                string.IsNullOrEmpty(mb.Name) ? mb.Address : $"{mb.Name} <{mb.Address}>");
            var joined = string.Join(", ", parts);
            return joined.Length == 0 ? null : joined;
        }

        internal static string? StripHtml(string? html)
        {
            if (html is null) return null;
            var withoutBlocks = NonContentBlock.Replace(html, " ");
            var withoutTags = HtmlTag.Replace(withoutBlocks, " ");
            // Entities would otherwise show as "&nbsp;" and "&amp;" in the list.
            var decoded = System.Net.WebUtility.HtmlDecode(withoutTags);
            return Whitespace.Replace(decoded, " ").Trim();
        }

        internal static string? MakeSnippet(string? text)
        {
            if (string.IsNullOrWhiteSpace(text)) return null;
            var s = Whitespace.Replace(text, " ").Trim();
            return s.Length <= 200 ? s : s[..200];
        }
    }
}
