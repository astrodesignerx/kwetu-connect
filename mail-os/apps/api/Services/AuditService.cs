using Kompanion.Api.Data;

namespace Kompanion.Api.Services;

/// <summary>
/// Write path for the audit log. Every admin action that touches another user's
/// data must go through here — oversight without an audit trail is a liability.
/// </summary>
public class AuditService
{
    private readonly AppDbContext _db;

    public AuditService(AppDbContext db) => _db = db;

    public async Task LogAsync(Guid actorUserId, string actorEmail, string action,
        Guid? targetUserId = null, string? targetEmail = null,
        Guid? targetMailboxId = null, string? details = null)
    {
        _db.AuditLogEntries.Add(new AuditLogEntry
        {
            ActorUserId = actorUserId,
            ActorEmail = actorEmail,
            Action = action,
            TargetUserId = targetUserId,
            TargetEmail = targetEmail,
            TargetMailboxId = targetMailboxId,
            Details = details
        });
        await _db.SaveChangesAsync();
    }
}
