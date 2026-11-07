using Kompanion.Api.Auth;
using Kompanion.Api.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Kompanion.Api.Controllers;

// A bounded lookup keeps list avatars and direct brief links tied to real mailboxes.
[ApiController, Authorize, Route("api/mail/insights")]
public class MailInsightsController(AppDbContext db) : ControllerBase
{
    public record MailInsight(Guid Id, Guid MailboxConnectionId, Guid? ClientId, string? ClientName);

    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<MailInsight>>> Get([FromQuery] Guid[]? ids, CancellationToken ct)
    {
        ids ??= [];
        if (ids.Length > 200) return BadRequest(new { error = "Request at most 200 conversations." });
        var orgId = this.CallerOrgId();
        var threads = await db.MailThreads.AsNoTracking()
            .Where(thread => ids.Contains(thread.Id) && thread.MailboxConnection.User!.OrganizationId == orgId)
            .Select(thread => new { thread.Id, thread.MailboxConnectionId })
            .ToListAsync(ct);
        var visible = threads.Select(thread => thread.Id).ToArray();
        var links = await db.ThreadCompanies.AsNoTracking()
            .Where(link => visible.Contains(link.ThreadId) && link.Company.OrganizationId == orgId)
            .Select(link => new { link.ThreadId, link.CompanyId, link.Company.Name })
            .ToListAsync(ct);
        var clients = links.GroupBy(link => link.ThreadId)
            .ToDictionary(group => group.Key, group => group.OrderBy(link => link.CompanyId).First());
        return Ok(threads.Select(thread =>
        {
            clients.TryGetValue(thread.Id, out var client);
            return new MailInsight(thread.Id, thread.MailboxConnectionId, client?.CompanyId, client?.Name);
        }).ToList());
    }
}
