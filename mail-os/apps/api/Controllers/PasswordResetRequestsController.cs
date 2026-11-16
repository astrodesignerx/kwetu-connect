using System.Diagnostics;
using System.Security.Claims;
using System.Security.Cryptography;
using Kompanion.Api.Auth;
using Kompanion.Api.Data;
using Kompanion.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;

namespace Kompanion.Api.Controllers;

[ApiController]
[Route("api")]
public sealed class PasswordResetRequestsController(AppDbContext db, AuditService audit,
    PasswordResetService passwords, ILogger<PasswordResetRequestsController> logger) : ControllerBase
{
    public record RequestBody(string? Identifier);

    [AllowAnonymous]
    [HttpPost("auth/password-reset-requests")]
    [EnableRateLimiting(RateLimitPolicies.Auth)]
    public async Task<IActionResult> RequestReset(RequestBody body, CancellationToken ct)
    {
        var started = Stopwatch.StartNew();
        var responseAfter = TimeSpan.FromMilliseconds(RandomNumberGenerator.GetInt32(450, 551));
        var identifier = (body.Identifier ?? "").Trim().TrimStart('@').Trim().ToLowerInvariant();
        var id = Guid.NewGuid();
        var now = DateTimeOffset.UtcNow;
        try
        {
            // One atomic statement for every identifier, including unknown accounts.
            // The partial unique index also prevents duplicate concurrent requests.
            await db.Database.ExecuteSqlInterpolatedAsync($"""
                WITH requested AS (
                    INSERT INTO "PasswordResetRequests" ("Id", "UserId", "CreatedAt")
                    SELECT {id}, "Id", {now} FROM "Users"
                    WHERE "Email" = {identifier} OR "Username" = {identifier}
                    ON CONFLICT ("UserId") WHERE "ResolvedAt" IS NULL DO NOTHING
                    RETURNING "UserId"
                )
                INSERT INTO "AuditLogEntries" ("ActorUserId", "ActorEmail", "Action", "CreatedAt")
                SELECT u."Id", u."Email", 'auth.password_reset.request', {now}
                FROM "Users" u JOIN requested r ON r."UserId" = u."Id"
                """, ct);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            // Never expose account-dependent database errors or identifiers.
            logger.LogError("Unable to record a password reset request.");
        }
        var remaining = responseAfter - started.Elapsed;
        if (remaining > TimeSpan.Zero) await Task.Delay(remaining, ct);
        return Accepted(new { message = "If that account exists, your admins have been asked. They will give you a new password." });
    }

    [Authorize(Roles = "Admin")]
    [HttpGet("admin/password-reset-requests")]
    public async Task<IActionResult> List(CancellationToken ct)
    {
        var orgId = this.CallerOrgId();
        return Ok(await db.PasswordResetRequests.AsNoTracking()
            .Where(r => r.ResolvedAt == null && r.User.OrganizationId == orgId)
            .OrderBy(r => r.CreatedAt)
            .Select(r => new { r.Id, r.UserId, r.User.DisplayName, r.User.Email, r.CreatedAt }).ToListAsync(ct));
    }

    [Authorize(Roles = "Admin")]
    [HttpPost("admin/users/{id:guid}/reset-password")]
    public async Task<IActionResult> Reset(Guid id, CancellationToken ct)
    {
        if (id == this.CallerId()) return BadRequest(new { error = "Change your own password under Settings, Profile." });
        var orgId = this.CallerOrgId();
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        var user = await db.Users.FirstOrDefaultAsync(u => u.Id == id && u.OrganizationId == orgId, ct);
        if (user is null) return NotFound();
        var result = await passwords.ResetAsync(user.Email, ct);
        await Resolve(db.PasswordResetRequests.Where(r => r.UserId == id && r.ResolvedAt == null), ct);
        await audit.LogAsync(this.CallerId(), User.FindFirstValue(ClaimTypes.Email) ?? "",
            "admin.user.password_reset", targetUserId: id, targetEmail: user.Email);
        await tx.CommitAsync(ct);
        Response.Headers.CacheControl = "no-store";
        return Ok(new { newPassword = result.NewPassword });
    }

    [Authorize(Roles = "Admin")]
    [HttpDelete("admin/password-reset-requests/{id:guid}")]
    public async Task<IActionResult> Dismiss(Guid id, CancellationToken ct)
    {
        var orgId = this.CallerOrgId();
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        var request = await db.PasswordResetRequests.Include(r => r.User)
            .FirstOrDefaultAsync(r => r.Id == id && r.User.OrganizationId == orgId && r.ResolvedAt == null, ct);
        if (request is null) return NotFound();
        await Resolve(db.PasswordResetRequests.Where(r => r.Id == id && r.ResolvedAt == null), ct);
        await audit.LogAsync(this.CallerId(), User.FindFirstValue(ClaimTypes.Email) ?? "",
            "admin.password_reset.dismiss", targetUserId: request.UserId, targetEmail: request.User.Email);
        await tx.CommitAsync(ct);
        return NoContent();
    }

    private Task<int> Resolve(IQueryable<PasswordResetRequest> requests, CancellationToken ct) =>
        requests.ExecuteUpdateAsync(setters => setters.SetProperty(r => r.ResolvedAt, DateTimeOffset.UtcNow)
            .SetProperty(r => r.ResolvedByUserId, this.CallerId()), ct);
}
