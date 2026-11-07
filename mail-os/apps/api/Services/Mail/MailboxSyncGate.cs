using System.Collections.Concurrent;

namespace Kompanion.Api.Services.Mail;

/// <summary>
/// Per-mailbox semaphore so a mailbox never has two syncs running at once (Hangfire
/// polling, IDLE wake-ups, and manual "sync now" can all fire concurrently).
/// Singleton — Hangfire server and the IDLE worker share this process.
/// </summary>
public class MailboxSyncGate
{
    private readonly ConcurrentDictionary<Guid, SemaphoreSlim> _locks = new();

    public async Task<bool> TryEnterAsync(Guid connectionId, CancellationToken ct)
    {
        var sem = _locks.GetOrAdd(connectionId, _ => new SemaphoreSlim(1, 1));
        return await sem.WaitAsync(0, ct);
    }

    /// <summary>
    /// Waits for the mailbox lock (cancellable) for actions that must run alone
    /// rather than be skipped when a sync is in flight. Release by disposing the
    /// returned lease with a plain <c>using</c>.
    /// </summary>
    public async Task<IDisposable> EnterAsync(Guid connectionId, CancellationToken ct)
    {
        var sem = _locks.GetOrAdd(connectionId, _ => new SemaphoreSlim(1, 1));
        await sem.WaitAsync(ct);
        return new Lease(this, connectionId);
    }

    public void Release(Guid connectionId)
    {
        if (_locks.TryGetValue(connectionId, out var sem))
            sem.Release();
    }

    private sealed class Lease : IDisposable
    {
        private readonly MailboxSyncGate _gate;
        private readonly Guid _connectionId;
        private bool _released;

        public Lease(MailboxSyncGate gate, Guid connectionId)
        {
            _gate = gate;
            _connectionId = connectionId;
        }

        public void Dispose()
        {
            if (_released) return;
            _released = true;
            _gate.Release(_connectionId);
        }
    }
}
