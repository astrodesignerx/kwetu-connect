using Kompanion.Api.Data;
using Kompanion.Api.Hubs;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;

namespace Kompanion.Api.Services.Mail;

// Resolve viewers when sending so revocations apply to already connected browsers.
public class MailNotifier(IHubContext<MailHub> hub, IServiceScopeFactory scopeFactory)
{
    public Task NotifyThreadsChangedAsync(Guid userId, Guid connectionId) =>
        SendAsync(connectionId, "threadsChanged", new { connectionId });

    public Task NotifySyncStateAsync(MailboxConnection connection) =>
        SendAsync(connection.Id, "mailboxSyncState", new
        {
            connectionId = connection.Id,
            state = connection.SyncState.ToString(),
            error = connection.SyncError,
            lastSyncCompletedAt = connection.LastSyncCompletedAt
        });

    public Task NotifyAssignmentChangedAsync(int orgId, Guid connectionId, Guid threadId, Guid assigneeUserId) =>
        SendAsync(connectionId, "threadAssigned", new { connectionId, threadId, assigneeUserId });

    public async Task NotifyNotesChangedAsync(int orgId, Guid threadId)
    {
        using var scope = scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var connectionId = await db.MailThreads.Where(t => t.Id == threadId)
            .Select(t => (Guid?)t.MailboxConnectionId).FirstOrDefaultAsync();
        if (connectionId is { } id) await SendAsync(id, "threadNotesChanged", new { threadId });
    }

    public Task NotifyAccessChangedAsync(Guid connectionId, IEnumerable<Guid> userIds) =>
        hub.Clients.Groups(userIds.Distinct().Select(id => $"user-{id}").ToArray())
            .SendAsync("mailboxAccessChanged", new { connectionId });

    private async Task SendAsync(Guid connectionId, string method, object payload)
    {
        using var scope = scopeFactory.CreateScope();
        var access = scope.ServiceProvider.GetRequiredService<MailboxAccessService>();
        var ids = await access.Viewers(connectionId).Select(u => u.Id).ToListAsync();
        if (ids.Count == 0) return;
        await hub.Clients.Groups(ids.Select(id => $"user-{id}").ToArray()).SendAsync(method, payload);
    }
}
