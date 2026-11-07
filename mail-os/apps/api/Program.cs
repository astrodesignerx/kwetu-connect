using System.Security.Claims;
using System.Text;
using System.Threading.RateLimiting;
using Kompanion.Api.Auth;
using Kompanion.Api.Data;
using Kompanion.Api.Hubs;
using Kompanion.Api.Jobs;
using Kompanion.Api.Services;
using Kompanion.Api.Services.Ai;
using Kompanion.Api.Services.Mail;
using Hangfire;
using Hangfire.PostgreSql;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.Diagnostics;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllers();
builder.Services.AddOpenApi();
builder.Services.AddSignalR();

var connectionString = builder.Configuration.GetConnectionString("Default")
    ?? "Host=127.0.0.1;Port=5432;Username=postgres;Password=postgres;Database=clientcomms";
builder.Services.AddDbContext<AppDbContext>(o => o.UseNpgsql(connectionString));

// Credential vault key ring: persisted outside the database so a DB dump alone
// cannot decrypt mailbox credentials. Production mounts this as a restricted volume.
var keyPath = builder.Configuration["DataProtection:KeyPath"]
    ?? Path.Combine(builder.Environment.ContentRootPath, "..", "..", "infra", "dpkeys");
var dataProtection = builder.Services.AddDataProtection()
    .PersistKeysToFileSystem(new DirectoryInfo(Path.GetFullPath(keyPath)))
    .SetApplicationName("Kompanion");
// Encrypt the key ring itself at rest on Windows (DPAPI). On the Linux production VM,
// the key directory is deployed as a restricted-permission mounted volume instead.
if (OperatingSystem.IsWindows())
    dataProtection.ProtectKeysWithDpapi();

// The signing key must be a real secret in any non-Development environment. Falling
// back to the committed dev key in production would let anyone mint valid admin tokens,
// so refuse to start rather than come up quietly insecure.
var jwtKey = builder.Configuration["Jwt:Key"];
if (string.IsNullOrWhiteSpace(jwtKey) || jwtKey.Length < 32
    || (!builder.Environment.IsDevelopment() && jwtKey.Contains("DEV-ONLY")))
{
    throw new InvalidOperationException(
        "Jwt:Key must be set to a unique secret of at least 32 characters (set it via the " +
        "Jwt__Key environment variable or user-secrets). The development placeholder is " +
        "not accepted outside the Development environment.");
}

builder.Services.AddMemoryCache();
builder.Services.AddSingleton<TokenVersionCache>();

builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme).AddJwtBearer(o =>
{
    o.TokenValidationParameters = new TokenValidationParameters
    {
        ValidateIssuer = true,
        ValidIssuer = builder.Configuration["Jwt:Issuer"],
        ValidateAudience = true,
        ValidAudience = builder.Configuration["Jwt:Audience"],
        ValidateIssuerSigningKey = true,
        IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtKey)),
        ValidateLifetime = true,
        ClockSkew = TimeSpan.FromMinutes(1)
    };
    o.Events = new JwtBearerEvents
    {
        // SignalR clients pass the JWT in the query string since browsers cannot set
        // arbitrary headers on the WebSocket upgrade.
        OnMessageReceived = ctx =>
        {
            var accessToken = ctx.Request.Query["access_token"];
            if (!string.IsNullOrEmpty(accessToken)
                && ctx.HttpContext.Request.Path.StartsWithSegments("/hubs"))
                ctx.Token = accessToken;
            return Task.CompletedTask;
        },
        // Reject tokens minted before the user's last credential change. A valid
        // signature is not enough on its own — see User.TokenVersion.
        OnTokenValidated = async ctx =>
        {
            var principal = ctx.Principal;
            if (principal?.HasClaim(c => c.Type == JwtTokenService.DevelopmentOnlyClaim) == true
                && !builder.Environment.IsDevelopment())
            {
                ctx.Fail("Development sessions are not accepted in this environment.");
                return;
            }
            var sub = principal?.FindFirst(ClaimTypes.NameIdentifier)?.Value
                   ?? principal?.FindFirst("sub")?.Value;
            var claimed = principal?.FindFirst(JwtTokenService.TokenVersionClaim)?.Value;

            if (!Guid.TryParse(sub, out var userId) || !int.TryParse(claimed, out var version))
            {
                ctx.Fail("Token is missing required claims.");
                return;
            }

            var cache = ctx.HttpContext.RequestServices.GetRequiredService<TokenVersionCache>();
            var current = await cache.GetAsync(userId);
            if (current is null || current != version)
                ctx.Fail("Token has been revoked. Sign in again.");
        }
    };
});
builder.Services.AddAuthorization();

// The SignalR hub is reached directly by the browser rather than through the Next dev
// server. Next's rewrite proxy buffers the response body, so Server-Sent Events arrive
// in no useful order and the hub's keepalive pings never reach the client — it connects,
// sits silent, and drops after 30 seconds with "server timeout elapsed". Going direct
// also restores real WebSockets. That makes the hub cross-origin in dev, hence CORS.
// Browser-only: no custom schemes. The web app is served over http(s) and every API
// call is same-origin through the Next rewrites above, or a configured browser origin.
var webOrigins = builder.Configuration["Cors:WebOrigins"]?
        .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
    ?? ["http://localhost:3013", "http://127.0.0.1:3013"];

builder.Services.AddCors(o => o.AddPolicy(CorsPolicies.Web, p => p
    .WithOrigins(webOrigins)
    .AllowAnyHeader()
    .AllowAnyMethod()
    // Required for the WebSocket upgrade and SSE stream to carry the connection.
    .AllowCredentials()));

// Rate limiting. Login and registration were unthrottled, so credentials could be
// brute-forced at network speed; the AI endpoints proxy a metered LLM, so an
// unthrottled loop is a billing problem as much as a load one.
// Configurable so the integration suite can raise them: every request from TestServer
// shares one partition, so production's 10/min would throttle the tests themselves
// rather than anything meaningful. One test lowers them again to assert throttling.
var authPerMinute = builder.Configuration.GetValue<int?>("RateLimits:AuthPerMinute") ?? 10;
var aiPerMinute = builder.Configuration.GetValue<int?>("RateLimits:AiPerMinute") ?? 20;
var uploadPerMinute = builder.Configuration.GetValue<int?>("RateLimits:UploadPerMinute") ?? 60;

builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    options.OnRejected = async (ctx, ct) =>
    {
        ctx.HttpContext.Response.ContentType = "application/json";
        await ctx.HttpContext.Response.WriteAsync(
            "{\"error\":\"Too many requests. Please wait a moment and try again.\"}", ct);
    };

    // Unauthenticated credential endpoints: keyed by client IP.
    options.AddPolicy(RateLimitPolicies.Auth, http =>
        RateLimitPartition.GetFixedWindowLimiter(
            http.Connection.RemoteIpAddress?.ToString() ?? "unknown",
            _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = authPerMinute,
                Window = TimeSpan.FromMinutes(1),
                QueueLimit = 0
            }));

    // LLM-backed endpoints: keyed by user, since cost follows the account.
    options.AddPolicy(RateLimitPolicies.Ai, http =>
        RateLimitPartition.GetFixedWindowLimiter(
            http.User.FindFirst(ClaimTypes.NameIdentifier)?.Value
                ?? http.Connection.RemoteIpAddress?.ToString() ?? "unknown",
            _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = aiPerMinute,
                Window = TimeSpan.FromMinutes(1),
                QueueLimit = 0
            }));

    // Uploads: bounded concurrency so a bulk attach can't saturate the box.
    options.AddPolicy(RateLimitPolicies.Upload, http =>
        RateLimitPartition.GetFixedWindowLimiter(
            http.User.FindFirst(ClaimTypes.NameIdentifier)?.Value
                ?? http.Connection.RemoteIpAddress?.ToString() ?? "unknown",
            _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = uploadPerMinute,
                Window = TimeSpan.FromMinutes(1),
                QueueLimit = 10
            }));
});

builder.Services.AddScoped<JwtTokenService>();
builder.Services.AddSingleton<CredentialVault>();
builder.Services.AddScoped<AuditService>();
builder.Services.AddScoped<SignalMetrics>();
builder.Services.AddScoped<PasswordResetService>();
builder.Services.AddScoped<MailboxVerifier>();

// Mail sync engine (Phase 2)
builder.Services.AddScoped<ImapConnectionFactory>();
builder.Services.AddScoped<IMailSessionFactory, MailKitMailSessionFactory>();
builder.Services.AddScoped<MailIngestor>();
builder.Services.AddScoped<ThreadingService>();
builder.Services.AddScoped<MailActionService>();
builder.Services.AddSingleton<MailboxSyncGate>();
builder.Services.AddSingleton<AttachmentStore>();
builder.Services.AddSingleton<MailNotifier>();
builder.Services.AddHostedService<IdleWorkerService>();
// Mail compose / send (Phase 3)
builder.Services.AddScoped<SmtpConnectionFactory>();
builder.Services.AddScoped<ISmtpTransport, MailKitSmtpTransport>();
builder.Services.AddScoped<ISentCopyFiler, ImapSentCopyFiler>();
builder.Services.AddScoped<SmtpSender>();
builder.Services.AddScoped<MailComposer>();
// Mail templates / brand kit (Phase 4)
builder.Services.AddSingleton<TemplateRenderer>();
// Clients controller is auto-resolved via DI.
// AI assistant (Phase 6) — backend-proxied LLM calls. The API key never leaves the server.
builder.Services.Configure<LlmOptions>(builder.Configuration.GetSection("LLM"));
builder.Services.AddHttpClient("llm");
builder.Services.AddSingleton<LlmClient>();
builder.Services.AddScoped<AiAssistant>();

// Hangfire (Postgres-backed job storage, same DB; separate schema)
builder.Services.AddHangfire(cfg => cfg
    .SetDataCompatibilityLevel(CompatibilityLevel.Version_180)
    .UseSimpleAssemblyNameTypeSerializer()
    .UseRecommendedSerializerSettings()
    .UsePostgreSqlStorage(o => o.UseNpgsqlConnection(connectionString)));
builder.Services.AddHangfireServer(o => o.WorkerCount = 4);

var app = builder.Build();

// Maintenance commands (reset-password, list-users) share the API's configuration and
// database, then exit without starting the web host or the sync workers.
// Collection import is additive maintenance against an existing schema, including dry runs.
if (!string.Equals(args.FirstOrDefault(), "import-kca-concepts", StringComparison.OrdinalIgnoreCase))
{
    using var cliScope = app.Services.CreateScope();
    cliScope.ServiceProvider.GetRequiredService<AppDbContext>().Database.Migrate();
}
var (cliHandled, cliExitCode) = await AdminCli.TryRunAsync(app, args);
if (cliHandled) return cliExitCode;

using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    db.Database.Migrate();
    if (!db.Organizations.Any())
    {
        db.Organizations.Add(new Organization
        {
            Name = builder.Configuration["Seed:OrganizationName"] ?? "Kwetu Connect Ads"
        });
        db.SaveChanges();
    }

    // Bootstrap sync for already-connected mailboxes: register the recurring job
    // and catch up on whatever the next sync was due to do. Lets the app survive a
    // restart without losing the polling watchdog.
    // Static scheduling must use this host's storage. A previous host in the same
    // process may have been disposed along with its database.
    JobStorage.Current = scope.ServiceProvider.GetRequiredService<JobStorage>();

    var existing = db.MailboxConnections.Where(c => c.IsActive).Select(c => c.Id).ToList();
    foreach (var id in existing)
    {
        MailSyncJobs.UnscheduleForMailbox(id);
        MailSyncJobs.ScheduleForMailbox(id);
    }

    // Nightly cleanup of abandoned uploads and unreferenced attachment blobs.
    AttachmentJobs.Schedule();
    FollowUpJobs.Schedule();
}

// Unhandled exceptions used to surface as a raw stack trace, which leaks file paths,
// connection details and internal structure to whoever triggered the error.
app.UseExceptionHandler(errorApp => errorApp.Run(async context =>
{
    var feature = context.Features.Get<IExceptionHandlerFeature>();
    var logger = context.RequestServices.GetRequiredService<ILoggerFactory>()
        .CreateLogger("UnhandledException");
    logger.LogError(feature?.Error, "Unhandled exception for {Method} {Path}",
        context.Request.Method, context.Request.Path);

    context.Response.StatusCode = StatusCodes.Status500InternalServerError;
    context.Response.ContentType = "application/json";
    await context.Response.WriteAsJsonAsync(new
    {
        error = "Something went wrong handling that request.",
        // The detail is for the developer at the console, not the caller.
        detail = app.Environment.IsDevelopment() ? feature?.Error.Message : null
    });
}));

if (!app.Environment.IsDevelopment())
{
    // Dev runs plain HTTP behind the Next proxy; production terminates TLS.
    app.UseHsts();
    app.UseHttpsRedirection();
}

app.Use(async (context, next) =>
{
    var headers = context.Response.Headers;
    headers["X-Content-Type-Options"] = "nosniff";
    headers["X-Frame-Options"] = "DENY";
    headers["Referrer-Policy"] = "no-referrer";
    headers["Cross-Origin-Opener-Policy"] = "same-origin";
    headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=(), interest-cohort=()";
    // This API serves JSON and attachment bytes, never markup. Locking the CSP all the
    // way down means a content-type confusion bug can't turn a stored message body into
    // an execution context.
    headers["Content-Security-Policy"] = "default-src 'none'; frame-ancestors 'none'; sandbox";
    await next();
});

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
    app.MapHangfireDashboard("/hangfire");
}

// Must run before authentication so preflight requests get their headers.
app.UseCors(CorsPolicies.Web);

app.UseAuthentication();
app.UseAuthorization();
app.UseRateLimiter();

app.MapControllers();
app.MapHub<MailHub>("/hubs/mail").RequireCors(CorsPolicies.Web);
app.MapGet("/api/health", () => Results.Ok(new { status = "ok", time = DateTimeOffset.UtcNow }));

app.Run();
return 0;

// Exposed so the integration test project can build a TestServer around this pipeline.
public partial class Program;
