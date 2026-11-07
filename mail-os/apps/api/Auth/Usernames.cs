using System.Globalization;
using System.Text;

namespace Kompanion.Api.Auth;

/// <summary>
/// Rules for the login handle. One implementation so registration, profile edits and
/// the backfill migration can't disagree about what a valid username is.
/// </summary>
public static class Usernames
{
    public const int MinLength = 3;
    public const int MaxLength = 32;

    /// <summary>
    /// Normalises user input: trims a leading "@", lowercases, and strips accents so
    /// "Zoë" and "Zoe" don't become two different handles that look identical.
    /// </summary>
    public static string Normalize(string? raw)
    {
        var value = (raw ?? "").Trim().TrimStart('@').Trim();
        if (value.Length == 0) return "";

        var decomposed = value.Normalize(NormalizationForm.FormD);
        var sb = new StringBuilder(decomposed.Length);
        foreach (var c in decomposed)
        {
            if (CharUnicodeInfo.GetUnicodeCategory(c) == UnicodeCategory.NonSpacingMark) continue;
            sb.Append(char.ToLowerInvariant(c));
        }
        return sb.ToString().Normalize(NormalizationForm.FormC);
    }

    /// <summary>Error message for an invalid handle, or null when it is acceptable.</summary>
    public static string? Validate(string normalized)
    {
        if (normalized.Length < MinLength)
            return $"Username must be at least {MinLength} characters.";
        if (normalized.Length > MaxLength)
            return $"Username must be {MaxLength} characters or fewer.";
        if (!normalized.All(c => (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9')
                                 || c == '.' || c == '_' || c == '-'))
            return "Username can only contain letters, numbers, dots, underscores and hyphens.";
        if (!char.IsLetterOrDigit(normalized[0]) || !char.IsLetterOrDigit(normalized[^1]))
            return "Username must start and end with a letter or number.";

        return null;
    }

    /// <summary>
    /// Turns a display name (or email local part) into a candidate handle:
    /// "Kwetu Admin" becomes "kwetuadmin". Returns an empty string if nothing usable
    /// survives, so the caller can fall back.
    /// </summary>
    public static string Suggest(string? displayNameOrEmail)
    {
        // Strip a leading "@" before splitting on it, or an input that is already in
        // handle form ("@jane") splits to an empty local part and yields nothing.
        var source = (displayNameOrEmail ?? "").Trim().TrimStart('@');
        if (source.Contains('@')) source = source.Split('@')[0];

        var normalized = Normalize(source);
        var kept = new string(normalized
            .Where(c => (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') || c == '.' || c == '_' || c == '-')
            .ToArray())
            .Trim('.', '_', '-');

        if (kept.Length > MaxLength) kept = kept[..MaxLength].Trim('.', '_', '-');
        return kept.Length >= MinLength ? kept : "";
    }

    /// <summary>
    /// The first free handle based on <paramref name="candidate"/>, appending 2, 3, …
    /// until <paramref name="isTaken"/> says otherwise.
    /// </summary>
    public static async Task<string> MakeUniqueAsync(
        string candidate,
        Func<string, Task<bool>> isTaken,
        CancellationToken ct = default)
    {
        var seed = candidate.Length >= MinLength ? candidate : "user";

        if (!await isTaken(seed)) return seed;

        for (var suffix = 2; suffix < 10_000; suffix++)
        {
            var tail = suffix.ToString();
            var head = seed.Length + tail.Length > MaxLength
                ? seed[..(MaxLength - tail.Length)].TrimEnd('.', '_', '-')
                : seed;
            var attempt = head + tail;

            ct.ThrowIfCancellationRequested();
            if (!await isTaken(attempt)) return attempt;
        }

        // Practically unreachable for a team of this size.
        throw new InvalidOperationException($"Could not derive a free username from '{candidate}'.");
    }
}
