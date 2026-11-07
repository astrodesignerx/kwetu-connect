using System.Collections.Concurrent;
using System.Security.Claims;
using Kompanion.Api.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;

namespace Kompanion.Api.Hubs;

[Authorize]
public class MailHub : Hub
{
    private static readonly ConcurrentDictionary<Guid, HashSet<string>> _connectionsByUser = new();
    private readonly IServiceScopeFactory _scopeFactory;

    public MailHub(IServiceScopeFactory scopeFactory) => _scopeFactory = scopeFactory;

    // Shared inbox: mail events go to the whole org group (see MailNotifier), while
    // presence and collaboration events join the same per-org group below.
    public override async Task OnConnectedAsync()
    {
        var userIdStr = Context.User?.FindFirstValue(ClaimTypes.NameIdentifier)
                     ?? Context.User?.FindFirst("sub")?.Value;
        if (userIdStr is not null && Guid.TryParse(userIdStr, out var userId))
        {
            await Groups.AddToGroupAsync(Context.ConnectionId, $"user-{userId}");

            using var scope = _scopeFactory.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var orgId = await db.Users
                .Where(u => u.Id == userId)
                .Select(u => u.OrganizationId)
                .FirstOrDefaultAsync();
            if (orgId != 0)
                await Groups.AddToGroupAsync(Context.ConnectionId, $"org-{orgId}");

            var connections = _connectionsByUser.GetOrAdd(userId, _ => new HashSet<string>());
            var first = false;
            lock (connections) { first = connections.Add(Context.ConnectionId); }
            if (first)
            {
                // Broadcast presence change to org peers.
                if (orgId != 0)
                    await Clients.Group($"org-{orgId}").SendAsync("presenceChanged", new
                    {
                        userId, online = true
                    });
            }
        }
        await base.OnConnectedAsync();
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        var userIdStr = Context.User?.FindFirstValue(ClaimTypes.NameIdentifier)
                     ?? Context.User?.FindFirst("sub")?.Value;
        if (userIdStr is not null && Guid.TryParse(userIdStr, out var userId))
        {
            var last = false;
            if (_connectionsByUser.TryGetValue(userId, out var connections))
            {
                lock (connections)
                {
                    connections.Remove(Context.ConnectionId);
                    last = connections.Count == 0;
                    if (last) _connectionsByUser.TryRemove(userId, out _);
                }
            }
            if (last)
            {
                using var scope = _scopeFactory.CreateScope();
                var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
                var orgId = await db.Users
                    .Where(u => u.Id == userId)
                    .Select(u => u.OrganizationId)
                    .FirstOrDefaultAsync();
                if (orgId != 0)
                    await Clients.Group($"org-{orgId}").SendAsync("presenceChanged", new
                    {
                        userId, online = false
                    });
            }
        }
        await base.OnDisconnectedAsync(exception);
    }

    /// <summary>
    /// Org-scoped presence snapshot for clients (re)connecting: which members of the
    /// caller's org currently hold a live connection. Deltas keep flowing over
    /// <c>presenceChanged</c>; this repairs anything missed while offline.
    /// </summary>
    public async Task<IEnumerable<object>> GetPresence()
    {
        var userIdStr = Context.User?.FindFirstValue(ClaimTypes.NameIdentifier)
                     ?? Context.User?.FindFirst("sub")?.Value;
        if (userIdStr is null || !Guid.TryParse(userIdStr, out var userId))
            return Array.Empty<object>();

        using var scope = _scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var orgId = await db.Users
            .Where(u => u.Id == userId)
            .Select(u => u.OrganizationId)
            .FirstOrDefaultAsync();
        if (orgId == 0) return Array.Empty<object>();

        var memberIds = await db.Users
            .Where(u => u.OrganizationId == orgId)
            .Select(u => u.Id)
            .ToListAsync();
        return memberIds
            .Where(id => _connectionsByUser.ContainsKey(id))
            .Select(id => (object)new { userId = id });
    }
}
