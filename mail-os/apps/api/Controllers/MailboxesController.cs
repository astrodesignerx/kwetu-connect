using System.Security.Claims;
using Kompanion.Api.Data;
using Kompanion.Api.Jobs;
using Kompanion.Api.Models;
using Kompanion.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Kompanion.Api.Controllers;

[ApiController]
[Route("api/mailboxes")]
[Authorize]
public class MailboxesController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly CredentialVault _vault;
    private readonly MailboxVerifier _verifier;

    public MailboxesController(AppDbContext db, CredentialVault vault, MailboxVerifier verifier)
    {
        _db = db;
        _vault = vault;
        _verifier = verifier;
    }

    // Members only ever see their own connections — scoping is enforced here,
    // server-side, never client-side.
    [HttpGet]
    public async Task<IActionResult> List()
    {
        var userId = UserId();
        var boxes = await _db.MailboxConnections
            .Where(m => m.UserId == userId)
            .OrderBy(m => m.CreatedAt)
            .ToListAsync();
        return Ok(boxes.Select(m => MailboxDto.From(m)));
    }

    [HttpPost]
    public async Task<IActionResult> Connect(ConnectMailboxRequest req, CancellationToken ct)
    {
        var email = req.Email.Trim().ToLowerInvariant();
        if (!email.Contains('@'))
            return BadRequest(new { error = "A valid mailbox email address is required." });
        if (string.IsNullOrEmpty(req.Password))
            return BadRequest(new { error = "Mailbox password is required." });

        var userId = UserId();
        if (await _db.MailboxConnections.AnyAsync(m => m.UserId == userId && m.Email == email))
            return Conflict(new { error = "This mailbox is already connected." });

        var domain = email.Split('@')[1];
        var imapPort = req.ImapPort ?? 993;
        var candidateHosts = !string.IsNullOrWhiteSpace(req.ImapHost)
            ? new[] { req.ImapHost.Trim() }
            : new[] { $"webmail.{domain}", $"mail.{domain}" };

        string? resolvedHost = null;
        string? lastError = null;
        foreach (var host in candidateHosts)
        {
            var (ok, error, resolved) = await _verifier.VerifyImapLoginAsync(host, imapPort, email, req.Password, ct);
            if (ok)
            {
                resolvedHost = resolved;
                break;
            }
            lastError = error;
        }

        if (resolvedHost is null)
            return BadRequest(new { error = $"Mailbox verification failed — {lastError}" });

        var connection = new MailboxConnection
        {
            UserId = userId,
            Email = email,
            ImapHost = resolvedHost,
            ImapPort = imapPort,
            SmtpHost = string.IsNullOrWhiteSpace(req.SmtpHost) ? resolvedHost : req.SmtpHost.Trim(),
            SmtpPort = req.SmtpPort ?? 465,
            EncryptedCredentials = _vault.Protect(req.Password),
            LastVerifiedAt = DateTimeOffset.UtcNow
        };

        _db.MailboxConnections.Add(connection);
        await _db.SaveChangesAsync();

        // Schedule the full backfill and the recurring incremental-sync watchdog.
        MailSyncJobs.ScheduleForMailbox(connection.Id);

        return Ok(MailboxDto.From(connection));
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Disconnect(Guid id)
    {
        var userId = UserId();
        var connection = await _db.MailboxConnections
            .FirstOrDefaultAsync(m => m.Id == id && m.UserId == userId);
        if (connection is null) return NotFound(new { error = "Mailbox connection not found." });

        MailSyncJobs.UnscheduleForMailbox(id);
        _db.MailboxConnections.Remove(connection);
        await _db.SaveChangesAsync();
        return NoContent();
    }

    // Re-runs the IMAP verification using the stored (decrypted) credentials.
    // Exercises the vault round-trip and doubles as a "test connection" button.
    [HttpPost("{id:guid}/reverify")]
    public async Task<IActionResult> Reverify(Guid id, CancellationToken ct)
    {
        var userId = UserId();
        var connection = await _db.MailboxConnections
            .FirstOrDefaultAsync(m => m.Id == id && m.UserId == userId);
        if (connection is null) return NotFound(new { error = "Mailbox connection not found." });

        var password = _vault.Unprotect(connection.EncryptedCredentials);
        var (ok, error, resolved) = await _verifier.VerifyImapLoginAsync(
            connection.ImapHost, connection.ImapPort, connection.Email, password, ct);

        if (!ok) return BadRequest(new { error = $"Verification failed — {error}" });

        connection.LastVerifiedAt = DateTimeOffset.UtcNow;
        if (resolved is not null) connection.ImapHost = resolved;
        await _db.SaveChangesAsync();
        return Ok(MailboxDto.From(connection));
    }

    private Guid UserId()
    {
        var sub = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirstValue("sub");
        return Guid.Parse(sub!);
    }
}
