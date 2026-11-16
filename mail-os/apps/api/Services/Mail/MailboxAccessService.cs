using Kompanion.Api.Data;
using Microsoft.EntityFrameworkCore;

namespace Kompanion.Api.Services.Mail;

public sealed class MailboxAccessService(AppDbContext db)
{
    public IQueryable<MailboxConnection> Visible(Guid userId, int orgId, bool isAdmin) =>
        db.MailboxConnections.Where(c => c.User.OrganizationId == orgId
            && (isAdmin || c.UserId == userId || db.MailboxAccess.Any(a =>
                a.MailboxConnectionId == c.Id && a.UserId == userId)));

    public Task<bool> CanSeeAsync(Guid connectionId, Guid userId, int orgId, bool isAdmin,
        CancellationToken ct = default) => Visible(userId, orgId, isAdmin).AnyAsync(c => c.Id == connectionId, ct);

    public Task<bool> CanManageAsync(Guid connectionId, Guid userId, int orgId, bool isAdmin,
        CancellationToken ct = default) => db.MailboxConnections.AnyAsync(c => c.Id == connectionId
            && c.User.OrganizationId == orgId && (isAdmin || c.UserId == userId), ct);

    // Services authenticate their caller from the database rather than a supplied role.
    public async Task<IQueryable<MailboxConnection>> VisibleForUserAsync(Guid userId, CancellationToken ct)
    {
        var user = await db.Users.Where(u => u.Id == userId)
            .Select(u => new { u.OrganizationId, u.Role }).FirstOrDefaultAsync(ct);
        return user is null ? db.MailboxConnections.Where(c => false)
            : Visible(userId, user.OrganizationId, user.Role == UserRole.Admin);
    }

    public IQueryable<User> Viewers(Guid connectionId) => db.Users.Where(u =>
        db.MailboxConnections.Any(c => c.Id == connectionId && c.User.OrganizationId == u.OrganizationId
            && (u.Role == UserRole.Admin || c.UserId == u.Id || db.MailboxAccess.Any(a =>
                a.MailboxConnectionId == c.Id && a.UserId == u.Id))));
}
