using System.Collections.Concurrent;
using Kompanion.Api.Data;
using Kompanion.Api.Hubs;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;

namespace Kompanion.Api.Services.Mail;

/// <summary>
/// Server-side wrapper for pushing mail events to connected web clients.
///
/// Phase 7 made the inbox shared — every member of the org reads every mailbox — so
/// mail events go to the whole <c>org-{id}</c> group, not just the mailbox owner.
/// Sending only to <c>user-{ownerId}</c> meant a teammate watching a colleague's
/// mailbox never saw new mail arrive without a manual refresh.
/// </summary>
public class MailNotifier
{
    private readonly IHubContext<MailHub> _hub;
    private readonly IServiceScopeFactory _scopeFactory;

    // Mailbox owner -> org id. Users never move between orgs in this single-company
    // deployment, so this is a permanent cache rather than an expiring one.
    private readonly ConcurrentDictionary<Guid, int> _orgIdByUser = new();

    public MailNotifier(IHubContext<MailHub> hub, IServiceScopeFactory scopeFactory)
    {
        _hub = hub;
        _scopeFactory = scopeFactory;
    }

    public async Task NotifyThreadsChangedAsync(Guid userId, Guid connectionId)
    {
        var orgId = await OrgIdForUserAsync(userId);
        if (orgId == 0) return;
        await _hub.Clients.Group($"org-{orgId}")
            .SendAsync("threadsChanged", new { connectionId });
    }

    public async Task NotifySyncStateAsync(MailboxConnection connection)
    {
        var orgId = await OrgIdForUserAsync(connection.UserId);
        if (orgId == 0) return;
        await _hub.Clients.Group($"org-{orgId}")
            .SendAsync("mailboxSyncState", new
            {
                connectionId = connection.Id,
                state = connection.SyncState.ToString(),
                error = connection.SyncError,
                lastSyncCompletedAt = connection.LastSyncCompletedAt
            });
    }

    public Task NotifyAssignmentChangedAsync(int orgId, Guid connectionId, Guid threadId, Guid assigneeUserId) =>
        _hub.Clients.Group($"org-{orgId}")
            .SendAsync("threadAssigned", new { connectionId, threadId, assigneeUserId });

    public Task NotifyNotesChangedAsync(int orgId, Guid threadId) =>
        _hub.Clients.Group($"org-{orgId}")
            .SendAsync("threadNotesChanged", new { threadId });

    private async Task<int> OrgIdForUserAsync(Guid userId)
    {
        if (_orgIdByUser.TryGetValue(userId, out var cached)) return cached;

        // MailNotifier is a singleton (the IDLE worker and Hangfire jobs both use it),
        // so it opens its own scope rather than holding a DbContext.
        using var scope = _scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var orgId = await db.Users
            .Where(u => u.Id == userId)
            .Select(u => u.OrganizationId)
            .FirstOrDefaultAsync();

        if (orgId != 0) _orgIdByUser[userId] = orgId;
        return orgId;
    }
}
