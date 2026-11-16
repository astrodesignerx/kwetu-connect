using Kompanion.Api.Auth;
using Kompanion.Api.Services.Mail;
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
    private const string WrongPassword =
        "That email and password didn't work. Use the password you sign in to webmail with.";

    private readonly MailboxAccessService _access;
    private readonly AppDbContext _db;
    private readonly CredentialVault _vault;
    private readonly MailboxVerifier _verifier;

    public MailboxesController(AppDbContext db, CredentialVault vault, MailboxVerifier verifier, MailboxAccessService access)
    {
        _db = db;
        _access = access;
        _vault = vault;
        _verifier = verifier;
    }

    // Members only ever see their own connections — scoping is enforced here,
    // server-side, never client-side.
    [HttpGet]
    public async Task<IActionResult> List()
    {
        var userId = UserId();
        var boxes = await _access.Visible(userId, this.CallerOrgId(), User.IsInRole("Admin"))
            .Include(m => m.User)
            .OrderBy(m => m.CreatedAt)
            .ToListAsync();
        return Ok(boxes.Select(m => MailboxDto.From(m, canManage: User.IsInRole("Admin") || m.UserId == userId)));
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
        await using var tx = await _db.Database.BeginTransactionAsync(ct);
        var duplicateKey = $"mailbox:{this.CallerOrgId()}:{email}";
        await _db.Database.ExecuteSqlInterpolatedAsync($"SELECT pg_advisory_xact_lock(hashtext({duplicateKey}))", ct);
        if (await _access.Visible(userId, this.CallerOrgId(), true).AnyAsync(m => m.Email == email))
            return Conflict(new { error = "That mailbox is already connected." });

        var domain = email.Split('@')[1];
        var imapPort = req.ImapPort ?? 993;
        var smtpPort = req.SmtpPort ?? 465;
        var customImap = !string.IsNullOrWhiteSpace(req.ImapHost);
        var customSmtp = !string.IsNullOrWhiteSpace(req.SmtpHost);

        var imap = await _verifier.FindImapHostAsync(
            customImap ? [req.ImapHost!.Trim()] : MailboxVerifier.ImapCandidates(domain),
            imapPort, email, req.Password, ct);
        if (imap.Host is null)
            return BadRequest(new { error = imap.CredentialsRejected
                ? WrongPassword
                : customImap ? imap.Error : $"We couldn't reach a mail server for {domain}. If your provider uses different servers, add them under \"My provider needs specific servers\"." });

        // Connecting used to copy the IMAP host here unchecked, which left mailboxes that
        // could read mail and then fail on the first send.
        var smtp = await _verifier.FindSmtpHostAsync(
            customSmtp ? [req.SmtpHost!.Trim()] : MailboxVerifier.SmtpCandidates(domain, imap.Host),
            smtpPort, email, req.Password, ct);
        if (smtp.Host is null)
            return BadRequest(new { error = smtp.CredentialsRejected
                ? WrongPassword
                : customSmtp ? smtp.Error : "We could sign in, but couldn't find a server for sending mail. Add your provider's sending server under \"My provider needs specific servers\"." });

        var connection = new MailboxConnection
        {
            UserId = userId,
            Email = email,
            ImapHost = imap.Host,
            ImapPort = imapPort,
            SmtpHost = smtp.Host,
            SmtpPort = smtpPort,
            EncryptedCredentials = _vault.Protect(req.Password),
            LastVerifiedAt = DateTimeOffset.UtcNow
        };

        _db.MailboxConnections.Add(connection);
        await _db.SaveChangesAsync();
        await tx.CommitAsync(ct);

        await _db.Entry(connection).Reference(c => c.User).LoadAsync(ct);

        // Schedule the full backfill and the recurring incremental-sync watchdog.
        MailSyncJobs.ScheduleForMailbox(connection.Id);

        return Ok(MailboxDto.From(connection, canManage: true));
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Disconnect(Guid id)
    {
        var userId = UserId();
        if (!await _access.CanManageAsync(id, userId, this.CallerOrgId(), User.IsInRole("Admin")))
            return NotFound(new { error = "Mailbox connection not found." });
        var connection = await _db.MailboxConnections.Include(m => m.User)
            .FirstOrDefaultAsync(m => m.Id == id);
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
        if (!await _access.CanManageAsync(id, userId, this.CallerOrgId(), User.IsInRole("Admin")))
            return NotFound(new { error = "Mailbox connection not found." });
        var connection = await _db.MailboxConnections.Include(m => m.User)
            .FirstOrDefaultAsync(m => m.Id == id);
        if (connection is null) return NotFound(new { error = "Mailbox connection not found." });

        var password = _vault.Unprotect(connection.EncryptedCredentials);
        var (ok, error, resolved) = await _verifier.VerifyImapLoginAsync(
            connection.ImapHost, connection.ImapPort, connection.Email, password, ct);

        if (!ok) return BadRequest(new { error = $"Verification failed — {error}" });

        connection.LastVerifiedAt = DateTimeOffset.UtcNow;
        if (resolved is not null) connection.ImapHost = resolved;
        await _db.SaveChangesAsync();
        return Ok(MailboxDto.From(connection, canManage: true));
    }

    private Guid UserId()
    {
        var sub = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirstValue("sub");
        return Guid.Parse(sub!);
    }
}
