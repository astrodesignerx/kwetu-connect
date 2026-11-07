using System.Collections.Concurrent;
using Kompanion.Api.Data;
using Kompanion.Api.Jobs;
using MailKit;
using MailKit.Net.Imap;
using Microsoft.EntityFrameworkCore;

namespace Kompanion.Api.Services.Mail;

/// <summary>
/// Holds one IMAP IDLE connection per syncing mailbox (Dovecot supports IDLE — verified
/// in Phase 0). A wake-up or flag change enqueues an incremental sync; the 9-minute
/// IDLE cycle stays well under server timeouts. The 5-minute Hangfire recurring job
/// remains as the polling fallback, so IDLE failure degrades, never breaks sync.
/// </summary>
public class IdleWorkerService : BackgroundService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILoggerFactory _loggerFactory;
    private readonly ILogger<IdleWorkerService> _logger;
    private readonly ConcurrentDictionary<Guid, IdleSession> _sessions = new();

    public IdleWorkerService(IServiceScopeFactory scopeFactory, ILoggerFactory loggerFactory)
    {
        _scopeFactory = scopeFactory;
        _loggerFactory = loggerFactory;
        _logger = loggerFactory.CreateLogger<IdleWorkerService>();
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        // Give the app a moment to finish startup (migrations, Hangfire bootstrap).
        await Task.Delay(TimeSpan.FromSeconds(5), stoppingToken);

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                using var scope = _scopeFactory.CreateScope();
                var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
                var active = await db.MailboxConnections
                    .Where(c => c.IsActive && c.SyncState == MailboxSyncState.Syncing)
                    .Select(c => c.Id)
                    .ToListAsync(stoppingToken);

                foreach (var id in active.Where(id => !_sessions.ContainsKey(id)))
                {
                    var session = new IdleSession(id, _scopeFactory, _loggerFactory.CreateLogger<IdleSession>());
                    if (_sessions.TryAdd(id, session)) session.Start();
                    else session.Dispose();
                }

                foreach (var id in _sessions.Keys.Except(active).ToList())
                {
                    if (_sessions.TryRemove(id, out var session)) session.Dispose();
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "IDLE supervisor tick failed");
            }

            await Task.Delay(TimeSpan.FromSeconds(30), stoppingToken);
        }

        foreach (var session in _sessions.Values) session.Dispose();
        _sessions.Clear();
    }

    private sealed class IdleSession : IDisposable
    {
        private readonly Guid _connectionId;
        private readonly IServiceScopeFactory _scopeFactory;
        private readonly ILogger<IdleSession> _logger;
        private readonly CancellationTokenSource _cts = new();
        private Task? _task;

        public IdleSession(Guid connectionId, IServiceScopeFactory scopeFactory, ILogger<IdleSession> logger)
        {
            _connectionId = connectionId;
            _scopeFactory = scopeFactory;
            _logger = logger;
        }

        public void Start() => _task = RunAsync(_cts.Token);

        private async Task RunAsync(CancellationToken ct)
        {
            while (!ct.IsCancellationRequested)
            {
                try
                {
                    using var scope = _scopeFactory.CreateScope();
                    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
                    var factory = scope.ServiceProvider.GetRequiredService<ImapConnectionFactory>();

                    var connection = await db.MailboxConnections.FindAsync(new object[] { _connectionId }, ct);
                    if (connection is null || !connection.IsActive) return;

                    using var client = await factory.ConnectAsync(connection, ct);
                    var inbox = client.Inbox;
                    await inbox.OpenAsync(FolderAccess.ReadOnly, ct);

                    using var idleDone = new CancellationTokenSource(TimeSpan.FromMinutes(9));
                    using var linked = CancellationTokenSource.CreateLinkedTokenSource(idleDone.Token, ct);
                    void Wake(object? sender, EventArgs e) => idleDone.Cancel();
                    inbox.CountChanged += Wake;
                    inbox.MessageFlagsChanged += Wake;
                    try
                    {
                        await client.IdleAsync(linked.Token);
                    }
                    finally
                    {
                        inbox.CountChanged -= Wake;
                        inbox.MessageFlagsChanged -= Wake;
                    }

                    _logger.LogDebug("IDLE wake for mailbox {Id}; enqueueing incremental sync", _connectionId);
                    MailSyncJobs.TriggerIncremental(_connectionId);
                    await Task.Delay(TimeSpan.FromSeconds(3), ct);
                }
                catch (OperationCanceledException) when (ct.IsCancellationRequested)
                {
                    return;
                }
                catch (MailKit.Security.AuthenticationException)
                {
                    _logger.LogWarning("IDLE: credentials rejected for mailbox {Id}; stopping session", _connectionId);
                    return; // supervisor stops the session once sync state flips to Error
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "IDLE session error for mailbox {Id}; backing off 1 minute", _connectionId);
                    try { await Task.Delay(TimeSpan.FromMinutes(1), ct); }
                    catch (OperationCanceledException) { return; }
                }
            }
        }

        public void Dispose()
        {
            _cts.Cancel();
            try { _task?.Wait(TimeSpan.FromSeconds(10)); } catch { /* shutting down */ }
            _cts.Dispose();
        }
    }
}
