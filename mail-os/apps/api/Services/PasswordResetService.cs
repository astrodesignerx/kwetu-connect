using System.Security.Cryptography;
using Kompanion.Api.Auth;
using Kompanion.Api.Data;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

namespace Kompanion.Api.Services;

/// <summary>
/// Out-of-band password reset, for when nobody can sign in to an account any more.
///
/// Password hashes are one-way, so a forgotten password can only be replaced, never
/// recovered. This deliberately generates the new password rather than accepting one:
/// the operator running it should not be choosing a colleague's credential, and a
/// generated value cannot be a weak one they reused elsewhere.
/// </summary>
public class PasswordResetService
{
    // Excludes look-alikes (0/O, 1/l/I) — this gets read off a terminal and typed once.
    private const string Alphabet = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";

    private readonly AppDbContext _db;
    private readonly TokenVersionCache _tokenVersions;

    public PasswordResetService(AppDbContext db, TokenVersionCache tokenVersions)
    {
        _db = db;
        _tokenVersions = tokenVersions;
    }

    public record Result(
        bool Found, string? Email, string? Username, string? DisplayName,
        string? Role, string? NewPassword);

    /// <summary>
    /// Generates a password of <paramref name="groups"/> hyphen-separated blocks.
    /// 20 characters from a 56-symbol alphabet is roughly 116 bits of entropy.
    /// </summary>
    public static string GeneratePassword(int groups = 4, int groupSize = 5)
    {
        var blocks = new string[groups];
        for (var g = 0; g < groups; g++)
        {
            var chars = new char[groupSize];
            for (var i = 0; i < groupSize; i++)
                chars[i] = Alphabet[RandomNumberGenerator.GetInt32(Alphabet.Length)];
            blocks[g] = new string(chars);
        }
        return string.Join('-', blocks);
    }

    /// <summary>
    /// Resets the account matching <paramref name="identifier"/> (email or display name,
    /// same resolution order as sign-in) and returns the new password. Every existing
    /// session for that user is revoked — a reset that left old tokens working would
    /// defeat its own purpose.
    /// </summary>
    public async Task<Result> ResetAsync(string identifier, CancellationToken ct = default)
    {
        var normalized = (identifier ?? "").Trim().TrimStart('@').Trim().ToLowerInvariant();
        if (normalized.Length == 0) return new Result(false, null, null, null, null, null);

        // Same resolution as sign-in: email or username, both unique and lowercase.
        var user = await _db.Users.FirstOrDefaultAsync(
            u => u.Email == normalized || u.Username == normalized, ct);
        if (user is null) return new Result(false, null, null, null, null, null);

        var password = GeneratePassword();
        user.PasswordHash = new PasswordHasher<User>().HashPassword(user, password);
        user.TokenVersion++;
        await _db.SaveChangesAsync(ct);
        _tokenVersions.Invalidate(user.Id);

        return new Result(true, user.Email, user.Username, user.DisplayName, user.Role.ToString(), password);
    }
}
