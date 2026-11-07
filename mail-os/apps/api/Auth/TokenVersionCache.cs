using Kompanion.Api.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;

namespace Kompanion.Api.Auth;

/// <summary>
/// Caches each user's current <see cref="User.TokenVersion"/> so validating a token on
/// every request doesn't cost a database round-trip.
///
/// Entries are evicted explicitly when the version is bumped (password change), so
/// revocation takes effect immediately in-process. The short TTL is a backstop for a
/// second instance, and for a version changed directly in the database.
/// </summary>
public class TokenVersionCache
{
    private readonly IMemoryCache _cache;
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly TimeSpan _ttl;

    public TokenVersionCache(IMemoryCache cache, IServiceScopeFactory scopeFactory, IConfiguration config)
    {
        _cache = cache;
        _scopeFactory = scopeFactory;

        // Configurable so tests can assert the out-of-band revocation path without
        // sleeping out a 30-second window.
        var seconds = config.GetValue<int?>("Auth:TokenVersionCacheSeconds") ?? 30;
        _ttl = TimeSpan.FromSeconds(Math.Clamp(seconds, 1, 300));
    }

    private static string Key(Guid userId) => $"tv:{userId}";

    /// <summary>Current version, or null if the user no longer exists.</summary>
    public async Task<int?> GetAsync(Guid userId)
    {
        if (_cache.TryGetValue<int?>(Key(userId), out var cached)) return cached;

        using var scope = _scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var version = await db.Users
            .Where(u => u.Id == userId)
            .Select(u => (int?)u.TokenVersion)
            .FirstOrDefaultAsync();

        _cache.Set(Key(userId), version, _ttl);
        return version;
    }

    /// <summary>Called after bumping a user's version so the next request re-reads it.</summary>
    public void Invalidate(Guid userId) => _cache.Remove(Key(userId));
}
