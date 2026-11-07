using Kompanion.Api.Data;
using Microsoft.EntityFrameworkCore;

namespace Kompanion.Api.Services.Mail;

/// <summary>
/// Rebuilds all threads for a mailbox connection from its stored messages.
/// Runs after every sync; deterministic (same messages in, same threads out).
/// </summary>
public class ThreadingService
{
    private readonly AppDbContext _db;

    public ThreadingService(AppDbContext db) => _db = db;

    public async Task<int> RebuildAsync(Guid connectionId, CancellationToken ct)
    {
        var messages = await _db.MailMessages
            .Where(m => m.MailboxConnectionId == connectionId)
            .Select(m => new ThreadInput(
                m.Id,
                m.MessageId,
                m.InReplyTo,
                m.HeaderReferences,
                m.Subject,
                m.NormalizedSubject,
                m.MessageDate ?? m.InternalDate,
                m.FromAddr,
                m.Snippet,
                !m.Flags.Contains("Seen"),
                m.HasAttachments))
            .ToListAsync(ct);

        var results = ThreadBuilder.BuildThreads(messages);
        var rebuildingMessageIds = results.SelectMany(r => r.MemberDbIds).Distinct().ToArray();
        var mailboxEmail = await _db.MailboxConnections.Where(c => c.Id == connectionId).Select(c => c.Email).SingleAsync(ct);
        var stateMessages = await _db.MailMessages.AsNoTracking()
            .Where(m => m.MailboxConnectionId == connectionId && rebuildingMessageIds.Contains(m.Id))
            .Select(m => new { m.Id, m.FromAddr, m.Folder.SpecialUse, Date = m.InternalDate ?? m.MessageDate ?? m.FetchedAt })
            .ToListAsync(ct);
        var stateById = stateMessages.ToDictionary(m => m.Id);
        var resultIds = results.Select(r => r.Id).ToHashSet();

        // Load existing threads for the connection so we can update in place and reuse
        // their Ids — URL-stable threads across rebuilds.
        var existing = await _db.MailThreads
            .Where(t => t.MailboxConnectionId == connectionId)
            .ToListAsync(ct);
        var byId = existing.ToDictionary(t => t.Id);

        // Detach all messages from threads first; we re-link below.
        await _db.MailMessages.Where(m => m.MailboxConnectionId == connectionId)
            .ExecuteUpdateAsync(s => s.SetProperty(m => m.ThreadId, (Guid?)null), ct);

        foreach (var r in results)
        {
            var latest = r.MemberDbIds.Select(id => stateById[id]).OrderByDescending(m => m.Date).ThenByDescending(m => m.Id).First();
            var latestState = latest.SpecialUse == FolderSpecialUse.Sent
                || string.Equals(latest.FromAddr, mailboxEmail, StringComparison.OrdinalIgnoreCase)
                ? ReplyState.Awaiting : ReplyState.ToReply;
            if (byId.TryGetValue(r.Id, out var existingThread))
            {
                existingThread.RootKey = r.RootKey;
                existingThread.NormalizedSubject = r.NormalizedSubject;
                existingThread.Subject = r.Subject;
                existingThread.MessageCount = r.MemberDbIds.Count;
                existingThread.FirstDate = r.FirstDate;
                existingThread.LastDate = r.LastDate;
                existingThread.HasUnread = r.HasUnread;
                existingThread.HasAttachments = r.HasAttachments;
                existingThread.Participants = r.Participants;
                existingThread.Snippet = r.Snippet;
            }
            else
            {
                _db.MailThreads.Add(new MailThread
                {
                    Id = r.Id,
                    MailboxConnectionId = connectionId,
                    RootKey = r.RootKey,
                    NormalizedSubject = r.NormalizedSubject,
                    Subject = r.Subject,
                    MessageCount = r.MemberDbIds.Count,
                    FirstDate = r.FirstDate,
                    LastDate = r.LastDate,
                    HasUnread = r.HasUnread,
                    HasAttachments = r.HasAttachments,
                    Participants = r.Participants,
                    Snippet = r.Snippet,
                    ReplyState = latestState,
                    StateSince = latest.Date
                });
            }
        }

        // Drop threads that no longer correspond to any root (e.g. all messages moved
        // out of a synced folder or subject-merge reshuffled them).
        var orphans = existing.Where(t => !resultIds.Contains(t.Id)).ToList();
        if (orphans.Count > 0)
            _db.MailThreads.RemoveRange(orphans);

        await _db.SaveChangesAsync(ct);

        foreach (var r in results)
        {
            var memberIds = r.MemberDbIds;
            var threadId = r.Id;
            await _db.MailMessages.Where(m => memberIds.Contains(m.Id))
                .ExecuteUpdateAsync(s => s.SetProperty(m => m.ThreadId, (Guid?)threadId), ct);
            var latest = memberIds.Select(id => stateById[id]).OrderByDescending(m => m.Date).ThenByDescending(m => m.Id).First();
            var latestState = latest.SpecialUse == FolderSpecialUse.Sent
                || string.Equals(latest.FromAddr, mailboxEmail, StringComparison.OrdinalIgnoreCase)
                ? ReplyState.Awaiting : ReplyState.ToReply;
            // Conditional update preserves a newer manual state change or accepted send.
            await _db.MailThreads.Where(t => t.Id == threadId && t.StateSince < latest.Date)
                .ExecuteUpdateAsync(s => s.SetProperty(t => t.ReplyState, latestState)
                    .SetProperty(t => t.StateSince, latest.Date).SetProperty(t => t.NeedsNudge, false), ct);
        }

        return results.Count;
    }
}
