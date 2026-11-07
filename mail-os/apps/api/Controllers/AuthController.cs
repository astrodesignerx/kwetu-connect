using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using Kompanion.Api.Auth;
using Kompanion.Api.Data;
using Kompanion.Api.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace Kompanion.Api.Controllers;

[ApiController]
[Route("api/auth")]
public class AuthController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly JwtTokenService _jwt;
    private readonly TokenVersionCache _tokenVersions;
    private readonly ILogger<AuthController> _logger;

    public AuthController(AppDbContext db, JwtTokenService jwt, TokenVersionCache tokenVersions,
        ILogger<AuthController> logger)
    {
        _db = db;
        _jwt = jwt;
        _tokenVersions = tokenVersions;
        _logger = logger;
    }

    /// <summary>
    /// Display names are free text again now that the login identifier is a separate
    /// handle — they no longer need to be unique or avoid '@'.
    /// </summary>
    private static string? ValidateDisplayName(string displayName) =>
        displayName.Trim().Length < 2 ? "Display name must be at least 2 characters." : null;

    /// <summary>
    /// Checks a caller-supplied handle. Returns an error message, or null when it is
    /// both well-formed and free.
    /// </summary>
    private async Task<string?> ValidateUsernameAsync(string normalized, Guid? excludeUserId, CancellationToken ct = default)
    {
        var formatError = Usernames.Validate(normalized);
        if (formatError is not null) return formatError;

        var taken = await _db.Users.AnyAsync(
            u => u.Username == normalized && (excludeUserId == null || u.Id != excludeUserId), ct);

        return taken ? "That username is already taken." : null;
    }

    /// <summary>
    /// Tells the sign-up page whether this deployment still needs its first (admin)
    /// account, so it can show open registration instead of asking for an invite code.
    /// </summary>
    [HttpGet("registration-mode")]
    [EnableRateLimiting(RateLimitPolicies.Auth)]
    public async Task<IActionResult> RegistrationMode()
    {
        var isBootstrap = !await _db.Users.AnyAsync();
        return Ok(new RegistrationModeResponse(isBootstrap ? "bootstrap" : "invite"));
    }

    /// <summary>
    /// Creates an account. The first account bootstraps the organization's admin and
    /// needs no invite; every account after it requires one.
    ///
    /// This used to be fully open. Combined with the Phase 7 shared inbox — where every
    /// member reads every mailbox in the org — anyone who could reach the API could
    /// self-register into full access to all company mail.
    /// </summary>
    [HttpPost("register")]
    [EnableRateLimiting(RateLimitPolicies.Auth)]
    public async Task<IActionResult> Register(RegisterRequest req)
    {
        var email = req.Email.Trim().ToLowerInvariant();
        if (!email.Contains('@'))
            return BadRequest(new { error = "A valid email address is required." });
        if (req.Password.Length < 8)
            return BadRequest(new { error = "Password must be at least 8 characters." });
        if (string.IsNullOrWhiteSpace(req.DisplayName))
            return BadRequest(new { error = "Display name is required." });
        if (await _db.Users.AnyAsync(u => u.Email == email))
            return Conflict(new { error = "An account with this email already exists." });

        // Serialise every registration in one transaction behind a Postgres advisory
        // lock. Without it, two concurrent first registrations both see an empty user
        // table and both become admin, and the same invitation can be redeemed twice.
        // The lock also makes invitation consumption atomic: the usability check, the
        // acceptance mark and the new account commit or roll back together.
        await using var tx = await _db.Database.BeginTransactionAsync();
        await _db.Database.ExecuteSqlRawAsync("SELECT pg_advisory_xact_lock(810001)");

        var isFirstUser = !await _db.Users.AnyAsync();

        Invitation? invitation = null;
        if (!isFirstUser)
        {
            if (string.IsNullOrWhiteSpace(req.InviteToken))
                return BadRequest(new { error = "An invitation is required to create an account. Ask an admin to invite you." });

            var hash = HashToken(req.InviteToken);
            invitation = await _db.Invitations.FirstOrDefaultAsync(i => i.TokenHash == hash);

            if (invitation is null || !invitation.IsUsable(DateTimeOffset.UtcNow))
                return BadRequest(new { error = "That invitation is invalid or has expired." });
            if (!string.Equals(invitation.Email, email, StringComparison.OrdinalIgnoreCase))
                return BadRequest(new { error = "That invitation was issued for a different email address." });
        }

        // Bootstrap joins the seeded organization; everyone else joins the one their
        // invitation was issued for. Resolved here rather than up front — SingleAsync()
        // on Organizations threw the moment a second org existed, even though the
        // invite path never needed the seed row.
        int organizationId;
        if (isFirstUser)
        {
            var seedOrg = await _db.Organizations.OrderBy(o => o.Id).FirstOrDefaultAsync();
            if (seedOrg is null)
                return StatusCode(500, new { error = "No organization has been provisioned." });
            organizationId = seedOrg.Id;
        }
        else
        {
            organizationId = invitation!.OrganizationId;
        }

        var displayNameError = ValidateDisplayName(req.DisplayName);
        if (displayNameError is not null) return BadRequest(new { error = displayNameError });

        // A caller-chosen handle must be valid and free; otherwise derive one from the
        // display name ("Kwetu Admin" -> kwetuadmin) and disambiguate if it's taken.
        string username;
        if (!string.IsNullOrWhiteSpace(req.Username))
        {
            username = Usernames.Normalize(req.Username);
            var usernameError = await ValidateUsernameAsync(username, excludeUserId: null);
            if (usernameError is not null) return BadRequest(new { error = usernameError });
        }
        else
        {
            var seed = Usernames.Suggest(req.DisplayName);
            if (seed.Length == 0) seed = Usernames.Suggest(email);
            username = await Usernames.MakeUniqueAsync(
                seed, candidate => _db.Users.AnyAsync(u => u.Username == candidate));
        }

        var user = new User
        {
            OrganizationId = organizationId,
            Email = email,
            Username = username,
            DisplayName = req.DisplayName.Trim(),
            Role = isFirstUser ? UserRole.Admin : invitation!.Role,
            PasswordHash = ""
        };
        var hasher = new PasswordHasher<User>();
        user.PasswordHash = hasher.HashPassword(user, req.Password);

        _db.Users.Add(user);
        if (invitation is not null) invitation.AcceptedAt = DateTimeOffset.UtcNow;
        try
        {
            await _db.SaveChangesAsync();
        }
        catch (DbUpdateException ex) when (IsUniqueViolation(ex))
        {
            await tx.RollbackAsync();
            return Conflict(new { error = UniquenessMessage(ex) });
        }
        await tx.CommitAsync();

        return Ok(new AuthResponse(_jwt.CreateToken(user), UserDto.From(user)));
    }

    /// <summary>
    /// Signs in with an email address or a username. Both are stored lowercase and are
    /// unique, so a single query settles it — no ambiguity to resolve, unlike the old
    /// display-name lookup.
    /// </summary>
    [HttpPost("login")]
    [EnableRateLimiting(RateLimitPolicies.Auth)]
    public async Task<IActionResult> Login(LoginRequest req)
    {
        if (req.Identifier?.Trim() == "@admin" && req.Password == "@admin")
        {
            var environment = HttpContext.RequestServices.GetRequiredService<IWebHostEnvironment>();
            if (!environment.IsDevelopment())
                return Unauthorized(new { error = "Invalid credentials." });

            await using var transaction = await _db.Database.BeginTransactionAsync();
            await _db.Database.ExecuteSqlRawAsync("SELECT pg_advisory_xact_lock(810001)");
            var admin = await _db.Users.Where(u => u.Role == UserRole.Admin)
                .OrderBy(u => u.OrganizationId).ThenBy(u => u.Id).FirstOrDefaultAsync();
            if (admin is null)
            {
                var organization = await _db.Organizations.OrderBy(o => o.Id).FirstAsync();
                admin = new User
                {
                    OrganizationId = organization.Id,
                    Email = "development-admin@localhost.invalid",
                    Username = "developmentadmin",
                    DisplayName = "Development Admin",
                    Role = UserRole.Admin,
                    PasswordHash = ""
                };
                // The shortcut is never stored as an account password.
                admin.PasswordHash = new PasswordHasher<User>().HashPassword(admin,
                    Convert.ToHexString(RandomNumberGenerator.GetBytes(32)));
                _db.Users.Add(admin);
            }
            admin.LastLoginAt = DateTimeOffset.UtcNow;
            await _db.SaveChangesAsync();
            await transaction.CommitAsync();
            return Ok(new AuthResponse(_jwt.CreateToken(admin, developmentOnly: true), UserDto.From(admin)));
        }

        // Tolerates a pasted "@handle", since that's how the handle is displayed.
        var normalized = (req.Identifier ?? "").Trim().TrimStart('@').Trim().ToLowerInvariant();

        var user = normalized.Length == 0
            ? null
            : await _db.Users.FirstOrDefaultAsync(u => u.Email == normalized || u.Username == normalized);

        var invalid = Unauthorized(new { error = "Invalid credentials." });
        var hasher = new PasswordHasher<User>();

        if (user is null)
        {
            // Verify against a throwaway hash anyway. Returning early on an unknown
            // identifier makes the response measurably faster than a wrong password,
            // which is enough to enumerate who has an account.
            hasher.VerifyHashedPassword(new User
            {
                Email = normalized,
                Username = "",
                DisplayName = "",
                PasswordHash = DummyHash
            }, DummyHash, req.Password);
            return invalid;
        }

        if (hasher.VerifyHashedPassword(user, user.PasswordHash, req.Password) == PasswordVerificationResult.Failed)
            return invalid;

        user.LastLoginAt = DateTimeOffset.UtcNow;
        await _db.SaveChangesAsync();

        return Ok(new AuthResponse(_jwt.CreateToken(user), UserDto.From(user)));
    }

    [Authorize]
    [HttpGet("me")]
    public async Task<IActionResult> Me()
    {
        var user = await CurrentUserAsync();
        return user is null ? Unauthorized() : Ok(UserDto.From(user));
    }

    [Authorize]
    [HttpPatch("me")]
    public async Task<IActionResult> UpdateMe(UpdateProfileRequest req)
    {
        var user = await CurrentUserAsync();
        if (user is null) return Unauthorized();

        if (!string.IsNullOrWhiteSpace(req.DisplayName))
        {
            var displayNameError = ValidateDisplayName(req.DisplayName);
            if (displayNameError is not null) return BadRequest(new { error = displayNameError });
            user.DisplayName = req.DisplayName.Trim();
        }

        if (!string.IsNullOrWhiteSpace(req.Username))
        {
            var normalized = Usernames.Normalize(req.Username);
            var usernameError = await ValidateUsernameAsync(normalized, excludeUserId: user.Id);
            if (usernameError is not null) return BadRequest(new { error = usernameError });
            user.Username = normalized;
        }

        var passwordChanged = false;
        if (!string.IsNullOrEmpty(req.NewPassword))
        {
            if (req.NewPassword.Length < 8)
                return BadRequest(new { error = "New password must be at least 8 characters." });
            var hasher = new PasswordHasher<User>();
            if (string.IsNullOrEmpty(req.CurrentPassword)
                || hasher.VerifyHashedPassword(user, user.PasswordHash, req.CurrentPassword) == PasswordVerificationResult.Failed)
                return BadRequest(new { error = "Current password is incorrect." });

            user.PasswordHash = hasher.HashPassword(user, req.NewPassword);
            // Invalidate every token minted before this change — including any an
            // attacker may already hold. Without the bump a stolen 7-day token
            // survives the password reset that was supposed to stop it.
            user.TokenVersion++;
            passwordChanged = true;
        }

        await _db.SaveChangesAsync();

        string? refreshedToken = null;
        if (passwordChanged)
        {
            _tokenVersions.Invalidate(user.Id);
            // Hand back a fresh token so the caller isn't signed out of the session
            // they just changed the password in. Every other session is now dead.
            refreshedToken = _jwt.CreateToken(user);
        }

        return Ok(new UpdateProfileResponse(UserDto.From(user), refreshedToken));
    }

    /// <summary>SHA-256 hex of an invite token. Only the hash is ever persisted.</summary>
    internal static string HashToken(string token) =>
        Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(token))).ToLowerInvariant();

    private static bool IsUniqueViolation(DbUpdateException ex)
    {
        for (var inner = ex.InnerException; inner is not null; inner = inner.InnerException)
        {
            if (inner is PostgresException pg && pg.SqlState == PostgresErrorCodes.UniqueViolation)
                return true;
        }
        return false;
    }

    /// <summary>Maps a uniqueness conflict to a clear response instead of a 500.</summary>
    private static string UniquenessMessage(DbUpdateException ex)
    {
        for (var inner = ex.InnerException; inner is not null; inner = inner.InnerException)
        {
            if (inner is PostgresException pg && pg.SqlState == PostgresErrorCodes.UniqueViolation)
            {
                if ((pg.ConstraintName ?? "").Contains("Username", StringComparison.OrdinalIgnoreCase))
                    return "That username is already taken.";
                if ((pg.ConstraintName ?? "").Contains("Email", StringComparison.OrdinalIgnoreCase))
                    return "An account with this email already exists.";
                return "An account with these details already exists. Try signing in instead.";
            }
        }
        return "An account with these details already exists. Try signing in instead.";
    }

    // A genuine PBKDF2 hash of a random value, used purely to burn the same CPU time as
    // a real verification on the unknown-user path. Generated by the hasher rather than
    // hardcoded, so it is always a well-formed hash the verifier can parse.
    private static readonly string DummyHash = new PasswordHasher<User>().HashPassword(
        new User { Email = "", Username = "", DisplayName = "", PasswordHash = "" },
        Convert.ToHexString(RandomNumberGenerator.GetBytes(16)));

    private async Task<User?> CurrentUserAsync()
    {
        var sub = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirstValue("sub");
        return Guid.TryParse(sub, out var id) ? await _db.Users.FindAsync(id) : null;
    }
}
