using System.Security.Claims;
using Kompanion.Api.Auth;
using Kompanion.Api.Data;
using Kompanion.Api.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Contact = Kompanion.Api.Data.Contact;

namespace Kompanion.Api.Controllers;

[ApiController]
[Authorize]
[Route("api")]
public class ClientsController : ControllerBase
{
    private readonly AppDbContext _db;

    public ClientsController(AppDbContext db) => _db = db;

    private Guid UserId() => this.CallerId();

    // Read from the signed token rather than re-querying the user on every request.
    private int OrgId() => this.CallerOrgId();

    // ---------- Companies ----------

    [HttpGet("companies")]
    public async Task<IActionResult> ListCompanies(CancellationToken ct)
    {
        var orgId = OrgId();
        var companies = await _db.Companies
            .Where(c => c.OrganizationId == orgId)
            .OrderBy(c => c.Name)
            .ToListAsync(ct);

        var ids = companies.Select(c => c.Id).ToList();

        // One roll-up query: per-company thread counts (through projects too).
        var threadsByCompany = await _db.ThreadCompanies
            .Where(tc => ids.Contains(tc.CompanyId))
            .Select(tc => new { tc.CompanyId, tc.ThreadId, tc.Thread.HasUnread })
            .ToListAsync(ct);
        var threadsByProject = await _db.ThreadProjects
            .Where(tp => _db.Projects.Where(p => ids.Contains(p.CompanyId))
                .Select(p => p.Id).Contains(tp.ProjectId))
            .Select(tp => new { tp.Project.CompanyId, tp.ThreadId, tp.Thread.HasUnread })
            .ToListAsync(ct);

        var counts = ids.ToDictionary(
            id => id,
            id => new
            {
                Threads = threadsByCompany.Count(t => t.CompanyId == id)
                          + threadsByProject.Count(t => t.CompanyId == id),
                Unread = threadsByCompany.Count(t => t.CompanyId == id && t.HasUnread)
                         + threadsByProject.Count(t => t.CompanyId == id && t.HasUnread)
            });
        var projectCounts = await _db.Projects
            .Where(p => ids.Contains(p.CompanyId))
            .GroupBy(p => p.CompanyId)
            .Select(g => new { Id = g.Key, Count = g.Count() })
            .ToListAsync(ct);
        var projectMap = projectCounts.ToDictionary(x => x.Id, x => x.Count);

        var dtos = companies.Select(c =>
        {
            var stats = counts.GetValueOrDefault(c.Id);
            return new CompanyDto(c.Id, c.Name, c.Domain, c.Notes,
                projectMap.GetValueOrDefault(c.Id),
                stats.Threads, stats.Unread,
                c.CreatedAt, c.UpdatedAt);
        });
        return Ok(dtos);
    }

    [HttpGet("companies/{id:guid}")]
    public async Task<IActionResult> GetCompany(Guid id, CancellationToken ct)
    {
        var orgId = OrgId();
        var c = await _db.Companies
            .FirstOrDefaultAsync(x => x.Id == id && x.OrganizationId == orgId, ct);
        if (c is null) return NotFound(errorResponse("Company not found."));

        var projects = await _db.Projects
            .Where(p => p.CompanyId == c.Id)
            .OrderBy(p => p.Name)
            .ToListAsync(ct);

        var threads = await LoadThreadsForCompanyAsync(c.Id, orgId, ct);

        // Contacts: ones whose Email domain matches Company.Domain.
        var contacts = new List<ContactSummaryDto>();
        if (!string.IsNullOrEmpty(c.Domain))
        {
            contacts = await _db.Contacts
                .Where(co => co.OrganizationId == orgId
                    && (co.Email == c.Domain || co.Email.EndsWith("@" + c.Domain)))
                .OrderByDescending(co => co.MessageCount)
                .Select(co => new ContactSummaryDto(co.Id, co.Email, co.Name, co.MessageCount))
                .ToListAsync(ct);
        }

        var projectDtos = projects.Select(p => new ProjectDto(
            p.Id, p.CompanyId, p.Name, p.Description,
            threads.Count, // project thread-count surfaced at /projects/{id}; this is a top-level count
            0,
            p.CreatedAt, p.UpdatedAt)).ToList();

        return Ok(new CompanyDetailDto(
            new CompanyDto(c.Id, c.Name, c.Domain, c.Notes,
                projects.Count, threads.Count, threads.Count(t => t.HasUnread),
                c.CreatedAt, c.UpdatedAt),
            projectDtos, contacts, threads));
    }

    [HttpPost("companies")]
    public async Task<IActionResult> CreateCompany(CompanyUpsertRequest body, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(body.Name))
            return BadRequest(errorResponse("Company name is required."));
        var orgId = OrgId();
        var c = new Company
        {
            OrganizationId = orgId,
            Name = body.Name.Trim(),
            Domain = NullIfBlank(body.Domain),
            Notes = NullIfBlank(body.Notes)
        };
        _db.Companies.Add(c);
        await _db.SaveChangesAsync(ct);

        // Auto-link contacts whose email domain matches the new company.
        if (!string.IsNullOrEmpty(c.Domain))
        {
            // We don't auto-link *all* threads to the company here — the employee
            // picks the company for a thread explicitly. The contacts themselves are
            // already discoverable via the picker through a future improvement.
        }

        return Ok(new CompanyDto(c.Id, c.Name, c.Domain, c.Notes, 0, 0, 0, c.CreatedAt, c.UpdatedAt));
    }

    [HttpPatch("companies/{id:guid}")]
    public async Task<IActionResult> UpdateCompany(Guid id, CompanyUpsertRequest body, CancellationToken ct)
    {
        var orgId = OrgId();
        var c = await _db.Companies.FirstOrDefaultAsync(x => x.Id == id && x.OrganizationId == orgId, ct);
        if (c is null) return NotFound(errorResponse("Company not found."));
        if (string.IsNullOrWhiteSpace(body.Name))
            return BadRequest(errorResponse("Company name is required."));
        c.Name = body.Name.Trim();
        c.Domain = NullIfBlank(body.Domain);
        c.Notes = NullIfBlank(body.Notes);
        c.UpdatedAt = DateTimeOffset.UtcNow;
        await _db.SaveChangesAsync(ct);
        return Ok();
    }

    [HttpDelete("companies/{id:guid}")]
    public async Task<IActionResult> DeleteCompany(Guid id, CancellationToken ct)
    {
        var orgId = OrgId();
        var c = await _db.Companies.FirstOrDefaultAsync(x => x.Id == id && x.OrganizationId == orgId, ct);
        if (c is null) return NotFound(errorResponse("Company not found."));
        _db.Companies.Remove(c); // cascades to projects and thread links
        await _db.SaveChangesAsync(ct);
        return NoContent();
    }

    // ---------- Projects ----------

    [HttpPost("companies/{companyId:guid}/projects")]
    public async Task<IActionResult> CreateProject(Guid companyId, ProjectUpsertRequest body, CancellationToken ct)
    {
        var orgId = OrgId();
        var company = await _db.Companies.FirstOrDefaultAsync(c => c.Id == companyId && c.OrganizationId == orgId, ct);
        if (company is null) return NotFound(errorResponse("Company not found."));
        if (string.IsNullOrWhiteSpace(body.Name))
            return BadRequest(errorResponse("Project name is required."));
        var p = new Project
        {
            CompanyId = company.Id,
            Name = body.Name.Trim(),
            Description = NullIfBlank(body.Description)
        };
        _db.Projects.Add(p);
        await _db.SaveChangesAsync(ct);
        return Ok(new ProjectDto(p.Id, p.CompanyId, p.Name, p.Description, 0, 0, p.CreatedAt, p.UpdatedAt));
    }

    [HttpPatch("projects/{id:guid}")]
    public async Task<IActionResult> UpdateProject(Guid id, ProjectUpsertRequest body, CancellationToken ct)
    {
        var orgId = OrgId();
        var p = await _db.Projects
            .Include(x => x.Company)
            .FirstOrDefaultAsync(x => x.Id == id && x.Company!.OrganizationId == orgId, ct);
        if (p is null) return NotFound(errorResponse("Project not found."));
        if (string.IsNullOrWhiteSpace(body.Name))
            return BadRequest(errorResponse("Project name is required."));
        p.Name = body.Name.Trim();
        p.Description = NullIfBlank(body.Description);
        p.UpdatedAt = DateTimeOffset.UtcNow;
        await _db.SaveChangesAsync(ct);
        return Ok();
    }

    [HttpDelete("projects/{id:guid}")]
    public async Task<IActionResult> DeleteProject(Guid id, CancellationToken ct)
    {
        var orgId = OrgId();
        var p = await _db.Projects
            .Include(x => x.Company)
            .FirstOrDefaultAsync(x => x.Id == id && x.Company!.OrganizationId == orgId, ct);
        if (p is null) return NotFound(errorResponse("Project not found."));
        _db.Projects.Remove(p); // cascades to thread links
        await _db.SaveChangesAsync(ct);
        return NoContent();
    }

    // ---------- Thread association ----------

    [HttpGet("threads/{threadId:guid}/associations")]
    public async Task<IActionResult> GetAssociations(Guid threadId, CancellationToken ct)
    {
        var orgId = OrgId();
        var thread = await _db.MailThreads
            .Include(t => t.MailboxConnection)
            .FirstOrDefaultAsync(t => t.Id == threadId
                && t.MailboxConnection!.User!.OrganizationId == orgId, ct);
        if (thread is null) return NotFound(errorResponse("Thread not found."));

        var company = await _db.ThreadCompanies
            .Where(tc => tc.ThreadId == threadId)
            .Select(tc => tc.Company)
            .FirstOrDefaultAsync(ct);
        var projects = await _db.ThreadProjects
            .Where(tp => tp.ThreadId == threadId)
            .Select(tp => tp.Project)
            .ToListAsync(ct);
        var contacts = await _db.ThreadContacts
            .Where(tc => tc.ThreadId == threadId)
            .Select(tc => new ContactSummaryDto(tc.Contact.Id, tc.Contact.Email, tc.Contact.Name, tc.Contact.MessageCount))
            .ToListAsync(ct);

        var projectDtos = projects
            .Select(p => new ProjectDto(p.Id, p.CompanyId, p.Name, p.Description, 0, 0, p.CreatedAt, p.UpdatedAt))
            .ToList();
        var companyDto = company is null ? null
            : new CompanyDto(company.Id, company.Name, company.Domain, company.Notes, 0, 0, 0, company.CreatedAt, company.UpdatedAt);

        return Ok(new ThreadAssociationsDto(thread.Id, companyDto, projectDtos, contacts));
    }

    [HttpPost("threads/{threadId:guid}/company/{companyId:guid}")]
    public async Task<IActionResult> LinkCompany(Guid threadId, Guid companyId, CancellationToken ct)
    {
        var orgId = OrgId();
        if (!await OwnsThreadAsync(threadId, orgId, ct))
            return NotFound(errorResponse("Thread not found."));
        if (!await OwnsCompanyAsync(companyId, orgId, ct))
            return NotFound(errorResponse("Company not found."));

        var exists = await _db.ThreadCompanies
            .AnyAsync(tc => tc.ThreadId == threadId && tc.CompanyId == companyId, ct);
        if (!exists)
        {
            _db.ThreadCompanies.Add(new ThreadCompany { ThreadId = threadId, CompanyId = companyId });

            // When a thread is linked to a company, also link the contacts whose email
            // addresses appear in the thread — gives the client view a complete picture
            // without manual tagging of every person.
            var company = await _db.Companies.FindAsync(new object[] { companyId }, ct);
            var participatingEmails = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            if (company is not null)
            {
                var messageEmails = await _db.MailMessages
                    .Where(m => m.ThreadId == threadId)
                    .Select(m => new { m.FromAddr, m.ToAddrs, m.CcAddrs })
                    .ToListAsync(ct);
                foreach (var x in messageEmails)
                {
                    AddEmailsFrom(participatingEmails, x.FromAddr);
                    AddEmailsFrom(participatingEmails, x.ToAddrs);
                    AddEmailsFrom(participatingEmails, x.CcAddrs);
                }
                var contactIds = await _db.Contacts
                    .Where(co => co.OrganizationId == orgId && participatingEmails.Contains(co.Email))
                    .Select(co => co.Id)
                    .ToListAsync(ct);
                foreach (var cid in contactIds)
                {
                    if (!await _db.ThreadContacts.AnyAsync(tc => tc.ThreadId == threadId && tc.ContactId == cid, ct))
                        _db.ThreadContacts.Add(new ThreadContact { ThreadId = threadId, ContactId = cid });
                }
            }
            await _db.SaveChangesAsync(ct);
        }
        return NoContent();
    }

    [HttpDelete("threads/{threadId:guid}/company")]
    public async Task<IActionResult> UnlinkCompany(Guid threadId, CancellationToken ct)
    {
        var orgId = OrgId();
        if (!await OwnsThreadAsync(threadId, orgId, ct))
            return NotFound(errorResponse("Thread not found."));
        var link = await _db.ThreadCompanies.FirstOrDefaultAsync(tc => tc.ThreadId == threadId, ct);
        if (link is null) return NoContent();
        _db.ThreadCompanies.Remove(link);
        await _db.SaveChangesAsync(ct);
        return NoContent();
    }

    [HttpPost("threads/{threadId:guid}/projects/{projectId:guid}")]
    public async Task<IActionResult> LinkProject(Guid threadId, Guid projectId, CancellationToken ct)
    {
        var orgId = OrgId();
        if (!await OwnsThreadAsync(threadId, orgId, ct))
            return NotFound(errorResponse("Thread not found."));
        if (!await OwnsProjectAsync(projectId, orgId, ct))
            return NotFound(errorResponse("Project not found."));
        var exists = await _db.ThreadProjects
            .AnyAsync(tp => tp.ThreadId == threadId && tp.ProjectId == projectId, ct);
        if (!exists)
        {
            _db.ThreadProjects.Add(new ThreadProject { ThreadId = threadId, ProjectId = projectId });
            await _db.SaveChangesAsync(ct);
        }
        return NoContent();
    }

    [HttpDelete("threads/{threadId:guid}/projects/{projectId:guid}")]
    public async Task<IActionResult> UnlinkProject(Guid threadId, Guid projectId, CancellationToken ct)
    {
        var orgId = OrgId();
        if (!await OwnsThreadAsync(threadId, orgId, ct))
            return NotFound(errorResponse("Thread not found."));
        var link = await _db.ThreadProjects
            .FirstOrDefaultAsync(tp => tp.ThreadId == threadId && tp.ProjectId == projectId, ct);
        if (link is null) return NoContent();
        _db.ThreadProjects.Remove(link);
        await _db.SaveChangesAsync(ct);
        return NoContent();
    }

    // ---------- helpers ----------

    private async Task<List<ThreadSummaryDto>> LoadThreadsForCompanyAsync(Guid companyId, int orgId, CancellationToken ct)
    {
        // Threads linked directly to the company…
        var directThreadIds = await _db.ThreadCompanies
            .Where(tc => tc.CompanyId == companyId)
            .Select(tc => tc.ThreadId)
            .ToListAsync(ct);
        // …or via any of its projects.
        var projectThreadIds = await _db.ThreadProjects
            .Where(tp => tp.Project.CompanyId == companyId)
            .Select(tp => tp.ThreadId)
            .ToListAsync(ct);

        var ids = directThreadIds.Union(projectThreadIds).ToList();
        if (ids.Count == 0) return new List<ThreadSummaryDto>();

        var threads = await _db.MailThreads
            .Include(t => t.MailboxConnection)
            .Where(t => ids.Contains(t.Id) && t.MailboxConnection!.User!.OrganizationId == orgId)
            .OrderByDescending(t => t.LastDate)
            .ToListAsync(ct);

        return threads.Select(t => new ThreadSummaryDto(
            t.Id, t.Subject, t.Participants, t.Snippet,
            t.MessageCount, t.FirstDate, t.LastDate,
            t.HasUnread, t.HasAttachments, t.ReplyState.ToString(), t.StateSince, t.NeedsNudge)).ToList();
    }

    private async Task<bool> OwnsThreadAsync(Guid threadId, int orgId, CancellationToken ct) =>
        await _db.MailThreads
            .Include(t => t.MailboxConnection)
            .AnyAsync(t => t.Id == threadId && t.MailboxConnection!.User!.OrganizationId == orgId, ct);

    private async Task<bool> OwnsCompanyAsync(Guid companyId, int orgId, CancellationToken ct) =>
        await _db.Companies.AnyAsync(c => c.Id == companyId && c.OrganizationId == orgId, ct);

    private async Task<bool> OwnsProjectAsync(Guid projectId, int orgId, CancellationToken ct) =>
        await _db.Projects
            .Include(p => p.Company)
            .AnyAsync(p => p.Id == projectId && p.Company!.OrganizationId == orgId, ct);

    private static void AddEmailsFrom(HashSet<string> sink, string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw)) return;
        foreach (var part in raw.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
        {
            var lt = part.IndexOf('<');
            var gt = part.IndexOf('>');
            if (lt >= 0 && gt > lt)
            {
                var inside = part.Substring(lt + 1, gt - lt - 1).Trim();
                if (inside.Length > 0) sink.Add(inside);
            }
            else if (part.Contains('@'))
            {
                sink.Add(part);
            }
        }
    }

    private static string? NullIfBlank(string? v) => string.IsNullOrWhiteSpace(v) ? null : v;

    private static object errorResponse(string message) => new { error = message };
}
