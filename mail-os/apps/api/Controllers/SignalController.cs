using System.Security.Claims;
using Kompanion.Api.Auth;
using Kompanion.Api.Data;
using Kompanion.Api.Models;
using Kompanion.Api.Services;
using Kompanion.Api.Services.Mail;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Kompanion.Api.Controllers;

[ApiController, Authorize, Route("api")]
public class SignalController(AppDbContext db, SignalMetrics metrics, AuditService audit, MailNotifier notifier) : ControllerBase
{
    [HttpGet("mail/brief")]
    public async Task<ActionResult<MailBriefDto>> Brief(CancellationToken ct) =>
        Ok(await metrics.BriefAsync(this.CallerOrgId(), this.CallerId(), DateTimeOffset.UtcNow, ct));

    [HttpGet("stats/response-times")]
    public async Task<ActionResult<ResponseTimesDto>> ResponseTimes([FromQuery] string by = "client",
        [FromQuery] int days = 30, CancellationToken ct = default)
    {
        if (by is not ("client" or "user") || days is < 1 or > 365)
            return BadRequest(new { error = "Use by=client or by=user and days from 1 to 365." });
        return Ok(await metrics.ResponseTimesAsync(this.CallerOrgId(), by, days, DateTimeOffset.UtcNow, ct));
    }

    [HttpPost("mail/threads/{id:guid}/state")]
    public async Task<ActionResult<ThreadStateDto>> SetState(Guid id, SetThreadStateRequest body, CancellationToken ct)
    {
        if (body.State is not ("Done" or "ToReply"))
            return BadRequest(new { error = "State must be Done or ToReply (reopen)." });
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        var orgId = this.CallerOrgId();
        var thread = await db.MailThreads.Include(t => t.MailboxConnection)
            .FirstOrDefaultAsync(t => t.Id == id && t.MailboxConnection.User!.OrganizationId == orgId, ct);
        if (thread is null) return NotFound(new { error = "Thread not found." });
        var state = body.State == "Done" ? ReplyState.Done : ReplyState.ToReply;
        if (thread.ReplyState != state)
        {
            var previous = thread.ReplyState;
            thread.ReplyState = state;
            thread.StateSince = DateTimeOffset.UtcNow;
            thread.NeedsNudge = false;
            await audit.LogAsync(this.CallerId(), User.FindFirstValue(ClaimTypes.Email) ?? "",
                "mail.thread.state", targetMailboxId: thread.MailboxConnectionId,
                details: $"Thread {id}: {previous} to {state}.");
        }
        await tx.CommitAsync(ct);
        await notifier.NotifyThreadsChangedAsync(thread.MailboxConnection.UserId, thread.MailboxConnectionId);
        return Ok(new ThreadStateDto(id, thread.ReplyState.ToString(), thread.StateSince, thread.NeedsNudge));
    }

    [HttpGet("projects/{projectId:guid}/flights")]
    public async Task<ActionResult<List<ProjectFlightDto>>> Flights(Guid projectId, CancellationToken ct)
    {
        if (!await ProjectInOrg(projectId, ct)) return NotFound(new { error = "Project not found." });
        return Ok(await db.ProjectFlights.Where(f => f.ProjectId == projectId)
            .OrderBy(f => f.StartDate).ThenBy(f => f.SiteName)
            .Select(f => new ProjectFlightDto(f.Id, f.ProjectId, f.SiteName, f.StartDate, f.EndDate)).ToListAsync(ct));
    }

    [HttpPost("projects/{projectId:guid}/flights")]
    public async Task<ActionResult<ProjectFlightDto>> CreateFlight(Guid projectId, ProjectFlightRequest body, CancellationToken ct)
    {
        if (!await ProjectInOrg(projectId, ct)) return NotFound(new { error = "Project not found." });
        if (!ValidFlight(body)) return BadRequest(new { error = "Site name and valid start/end dates are required; end must be on or after start." });
        var flight = new ProjectFlight { ProjectId = projectId, SiteName = body.SiteName.Trim(), StartDate = body.StartDate, EndDate = body.EndDate };
        db.ProjectFlights.Add(flight);
        await db.SaveChangesAsync(ct);
        return Created($"/api/projects/{projectId}/flights", FlightDto(flight));
    }

    [HttpPatch("projects/{projectId:guid}/flights/{id:guid}")]
    public async Task<ActionResult<ProjectFlightDto>> UpdateFlight(Guid projectId, Guid id, ProjectFlightRequest body, CancellationToken ct)
    {
        var flight = await FlightInOrg(projectId, id, ct);
        if (flight is null) return NotFound(new { error = "Flight not found." });
        if (!ValidFlight(body)) return BadRequest(new { error = "Site name and valid start/end dates are required; end must be on or after start." });
        flight.SiteName = body.SiteName.Trim();
        flight.StartDate = body.StartDate;
        flight.EndDate = body.EndDate;
        await db.SaveChangesAsync(ct);
        return Ok(FlightDto(flight));
    }

    [HttpDelete("projects/{projectId:guid}/flights/{id:guid}")]
    public async Task<IActionResult> DeleteFlight(Guid projectId, Guid id, CancellationToken ct)
    {
        var flight = await FlightInOrg(projectId, id, ct);
        if (flight is null) return NotFound(new { error = "Flight not found." });
        db.ProjectFlights.Remove(flight);
        await db.SaveChangesAsync(ct);
        return NoContent();
    }

    private Task<bool> ProjectInOrg(Guid id, CancellationToken ct) =>
        db.Projects.AnyAsync(p => p.Id == id && p.Company.OrganizationId == this.CallerOrgId(), ct);

    private Task<ProjectFlight?> FlightInOrg(Guid projectId, Guid id, CancellationToken ct) =>
        db.ProjectFlights.FirstOrDefaultAsync(f => f.Id == id && f.ProjectId == projectId
            && f.Project.Company.OrganizationId == this.CallerOrgId(), ct);

    private static bool ValidFlight(ProjectFlightRequest body) => !string.IsNullOrWhiteSpace(body.SiteName)
        && body.StartDate != default && body.EndDate != default && body.EndDate >= body.StartDate;

    private static ProjectFlightDto FlightDto(ProjectFlight f) => new(f.Id, f.ProjectId, f.SiteName, f.StartDate, f.EndDate);
}
