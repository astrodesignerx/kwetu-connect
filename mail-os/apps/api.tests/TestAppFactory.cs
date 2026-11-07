using Kompanion.Api.Data;
using Kompanion.Api.Services.Mail;
using Hangfire.Logging;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Hosting;
using Npgsql;
using Xunit;

namespace Kompanion.Api.Tests;

/// <summary>
/// Boots the real API pipeline against a throwaway Postgres database.
///
/// Not an in-memory provider: the schema leans on Postgres-specific features (a stored
/// generated tsvector column, jsonb, GIN indexes) that only the real engine can create,
/// so an in-memory double would pass tests the real database would reject.
///
/// Requires the local dev Postgres from AGENTS.md to be running.
/// </summary>
public class TestAppFactory : WebApplicationFactory<Program>, IAsyncLifetime
{
    // Overridable so CI can point at its own Postgres service container. Defaults to
    // the portable dev instance from AGENTS.md.
    private static readonly string Host = Environment.GetEnvironmentVariable("TEST_PG_HOST") ?? "127.0.0.1";
    private static readonly string Port = Environment.GetEnvironmentVariable("TEST_PG_PORT") ?? "5432";
    private static readonly string User = Environment.GetEnvironmentVariable("TEST_PG_USER") ?? "postgres";
    private static readonly string Password = Environment.GetEnvironmentVariable("TEST_PG_PASSWORD") ?? "postgres";

    private static string Base => $"Host={Host};Port={Port};Username={User};Password={Password}";

    private static readonly string AdminConnection = $"{Base};Database=postgres;Maximum Pool Size=2";

    // Unique per factory so parallel test classes never share state.
    private readonly string _databaseName = $"clientcomms_test_{Guid.NewGuid():N}";
    private readonly string _testDataPath = Path.Combine(AppContext.BaseDirectory, "test-data", Guid.NewGuid().ToString("N"));

    private readonly IReadOnlyDictionary<string, string> _overrides;

    /// <param name="settings">
    /// Configuration applied after the defaults below, for tests that need a different
    /// setting than the rest of the suite (e.g. a low rate limit).
    /// </param>
    public TestAppFactory(IReadOnlyDictionary<string, string>? settings = null)
        => _overrides = settings ?? new Dictionary<string, string>();

    // Hangfire's static log provider otherwise binds to whichever test host logs
    // first; when that host is disposed, unrelated parallel classes fail inside
    // static storage initializers. One immortal provider owns logging instead.
    static TestAppFactory() =>
        LogProvider.SetCurrentLogProvider(TestLogProvider.Instance);

    // Each factory opens two pools against its database — EF's and Hangfire's storage.
    // Npgsql defaults to 100 connections per pool, so a handful of parallel test classes
    // will blow past Postgres's max_connections (100) and fail with unrelated-looking
    // errors. A small cap is plenty: these tests issue one query at a time.
    private string ConnectionString =>
        $"{Base};Database={_databaseName};Include Error Detail=true;Maximum Pool Size=5;Timeout=30";

    public async ValueTask InitializeAsync()
    {
        await using var admin = new NpgsqlConnection(AdminConnection);
        await admin.OpenAsync();
        await using var create = new NpgsqlCommand($"CREATE DATABASE \"{_databaseName}\"", admin);
        await create.ExecuteNonQueryAsync();
    }

    public override async ValueTask DisposeAsync()
    {
        await base.DisposeAsync();
        NpgsqlConnection.ClearAllPools();

        await using var admin = new NpgsqlConnection(AdminConnection);
        await admin.OpenAsync();
        await using var drop = new NpgsqlCommand(
            $"DROP DATABASE IF EXISTS \"{_databaseName}\" WITH (FORCE)", admin);
        await drop.ExecuteNonQueryAsync();
    }

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Development");

        builder.UseSetting("ConnectionStrings:Default", ConnectionString);
        builder.UseSetting("Jwt:Issuer", "clientcomms-test");
        builder.UseSetting("Jwt:Audience", "clientcomms-test");
        builder.UseSetting("Jwt:Key", "test-only-signing-key-of-sufficient-length-0123456789");
        builder.UseSetting("Seed:OrganizationName", "Test Org");
        // Shortest allowed TTL, so the out-of-band revocation test waits a second
        // rather than sleeping out the 30-second production window.
        builder.UseSetting("Auth:TokenVersionCacheSeconds", "1");

        // TestServer gives every request the same (null) remote IP, so the whole suite
        // shares one rate-limit partition. Production's 10/min would throttle the tests
        // rather than anything meaningful; RateLimitingTests lowers these again to
        // assert that throttling actually works.
        builder.UseSetting("RateLimits:AuthPerMinute", "100000");
        builder.UseSetting("RateLimits:AiPerMinute", "100000");
        builder.UseSetting("RateLimits:UploadPerMinute", "100000");

        foreach (var (key, value) in _overrides) builder.UseSetting(key, value);
        builder.UseSetting("LLM:ApiKey", "");
        builder.UseSetting("DataProtection:KeyPath", Path.Combine(_testDataPath, "keys"));
        builder.UseSetting("Attachments:Path",
            Path.Combine(_testDataPath, "attachments"));

        builder.ConfigureServices(services =>
        {
            // The IMAP IDLE worker would open real sockets to the mail host on startup.
            services.RemoveAll<IHostedService>();

            // Point EF at the per-run database.
            services.RemoveAll<DbContextOptions<AppDbContext>>();
            services.RemoveAll<AppDbContext>();
            services.AddDbContext<AppDbContext>(o => o.UseNpgsql(ConnectionString));
        });
    }

    /// <summary>Opens a DbContext against the test database for arrange/assert steps.</summary>
    public AppDbContext NewDbContext()
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseNpgsql(ConnectionString)
            .Options;
        return new AppDbContext(options);
    }

    public AttachmentStore AttachmentStore => Services.GetRequiredService<AttachmentStore>();
}
