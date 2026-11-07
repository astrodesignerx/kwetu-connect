using System.Net;
using System.Net.Http.Json;
using Xunit;

namespace Kompanion.Api.Tests;

/// <summary>
/// The rest of the suite raises the limits out of the way (see TestAppFactory) — every
/// TestServer request shares one partition, so production's 10/min would throttle the
/// tests themselves. This class puts a low limit back so the throttling is actually
/// covered rather than merely configured.
/// </summary>
public class RateLimitingTests : IAsyncLifetime
{
    private const int AuthLimit = 5;

    private TestAppFactory _factory = null!;

    public async ValueTask InitializeAsync()
    {
        _factory = new TestAppFactory(new Dictionary<string, string>
        {
            ["RateLimits:AuthPerMinute"] = AuthLimit.ToString()
        });
        await _factory.InitializeAsync();
    }

    public async ValueTask DisposeAsync() => await _factory.DisposeAsync();

    [Fact]
    public async Task Repeated_failed_logins_are_throttled()
    {
        var client = _factory.CreateClient();
        var statuses = new List<HttpStatusCode>();

        // Comfortably past the limit; a brute-force attempt looks exactly like this.
        for (var i = 0; i < AuthLimit + 5; i++)
        {
            var res = await client.PostAsJsonAsync("/api/auth/login",
                new { identifier = "nobody@test.local", password = $"guess-{i}" });
            statuses.Add(res.StatusCode);
        }

        Assert.Equal(AuthLimit, statuses.Count(s => s == HttpStatusCode.Unauthorized));
        Assert.Contains(HttpStatusCode.TooManyRequests, statuses);
        // Once throttled, it stays throttled for the rest of the window.
        Assert.Equal(HttpStatusCode.TooManyRequests, statuses[^1]);
    }

    [Fact]
    public async Task Throttling_also_covers_registration()
    {
        var client = _factory.CreateClient();
        HttpStatusCode last = HttpStatusCode.OK;

        for (var i = 0; i < AuthLimit + 3; i++)
        {
            var res = await client.PostAsJsonAsync("/api/auth/register", new
            {
                email = $"flood{i}@test.local",
                password = "password12345",
                displayName = $"Flood {i}"
            });
            last = res.StatusCode;
        }

        Assert.Equal(HttpStatusCode.TooManyRequests, last);
    }

    [Fact]
    public async Task Throttled_response_carries_a_readable_error()
    {
        var client = _factory.CreateClient();

        HttpResponseMessage? throttled = null;
        for (var i = 0; i < AuthLimit + 3 && throttled is null; i++)
        {
            var res = await client.PostAsJsonAsync("/api/auth/login",
                new { identifier = "nobody@test.local", password = "wrong" });
            if (res.StatusCode == HttpStatusCode.TooManyRequests) throttled = res;
        }

        Assert.NotNull(throttled);
        var body = await throttled!.Content.ReadFromJsonAsync<ErrorBody>();
        Assert.Contains("Too many requests", body!.Error);
    }

    private record ErrorBody(string Error);
}
