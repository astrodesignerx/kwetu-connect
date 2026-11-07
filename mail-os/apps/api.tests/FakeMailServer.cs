using Kompanion.Api.Data;
using Kompanion.Api.Services.Mail;
using MimeKit;

namespace Kompanion.Api.Tests;

/// <summary>
/// In-memory scripted IMAP server for focused failure tests. No sockets, no real
/// mailboxes: services under test talk to <see cref="IMailSessionFactory"/>, and the
/// test factory registers this fake instead of the MailKit implementation.
/// </summary>
public sealed class FakeMessageState
{
    public string? MessageId { get; set; }
    public bool Seen { get; set; }
    public Func<MimeMessage> BuildMime { get; set; } = () => new MimeMessage();
}

public sealed class FakeMailFolderState
{
    public uint UidValidity { get; set; } = 1;
    public Dictionary<uint, FakeMessageState> Messages { get; } = new();
    public bool FailOpen { get; set; }
    public bool FailSearch { get; set; }
    public bool FailFetch { get; set; }
    public bool FailMove { get; set; }
    public bool FailGetMessage { get; set; }
    /// <summary>When true, MoveTo succeeds but reports no UID mapping.</summary>
    public bool NullMoveMap { get; set; }
    /// <summary>UIDs whose body fetch throws.</summary>
    public HashSet<uint> FailGetUids { get; } = new();
    /// <summary>UIDs whose body fetch throws OperationCanceledException.</summary>
    public HashSet<uint> CancelGetUids { get; } = new();
    /// <summary>UIDs omitted from fetch summaries (incomplete snapshot).</summary>
    public HashSet<uint> DropSummaries { get; } = new();
    /// <summary>When true, unread restoration throws.</summary>
    public bool FailSetSeen { get; set; }
    /// <summary>When true, SetSeen throws OperationCanceledException.</summary>
    public bool CancelOnSetSeen { get; set; }
    /// <summary>When true, MoveTo throws OperationCanceledException.</summary>
    public bool CancelOnMove { get; set; }
    /// <summary>Invoked at the start of SetSeen (gate-holding probes).</summary>
    public Func<Task>? OnSetSeen { get; set; }
}

public sealed class FakeMailSessionFactory : IMailSessionFactory
{
    public Dictionary<string, FakeMailFolderState> Folders { get; } = new(StringComparer.OrdinalIgnoreCase);
    public List<string> OpenedFolders { get; } = new();
    public List<(string Folder, List<uint> Uids, bool Read)> SeenCalls { get; } = new();
    public List<(string From, List<uint> Uids, string To)> Moves { get; } = new();
    public int ConnectCount { get; private set; }
    /// <summary>When true, folder discovery throws.</summary>
    public bool FailListFolders { get; set; }
    /// <summary>Whether the fake server reports moved UIDs.</summary>
    public bool SupportsMoveMapping { get; set; } = true;

    public FakeMailFolderState Folder(string fullName)
    {
        if (!Folders.TryGetValue(fullName, out var state))
        {
            state = new FakeMailFolderState();
            Folders[fullName] = state;
        }
        return state;
    }

    public Task<IMailSession> ConnectAsync(MailboxConnection connection, CancellationToken ct)
    {
        ConnectCount++;
        return Task.FromResult<IMailSession>(new FakeMailSession(this));
    }

    private sealed class FakeMailSession : IMailSession
    {
        private readonly FakeMailSessionFactory _factory;
        private FakeMailFolderSession? _selected;

        public FakeMailSession(FakeMailSessionFactory factory) => _factory = factory;

        public bool SupportsMoveMapping => _factory.SupportsMoveMapping;

        public Task<IReadOnlyList<RemoteFolderDescriptor>> ListFoldersAsync(CancellationToken ct)
        {
            if (_factory.FailListFolders) throw new IOException("Simulated LIST failure.");
            return Task.FromResult<IReadOnlyList<RemoteFolderDescriptor>>(_factory.Folders
                .Select(kv => new RemoteFolderDescriptor(
                    kv.Key, false,
                    kv.Key.Equals("INBOX", StringComparison.OrdinalIgnoreCase),
                    kv.Key.Contains("Sent", StringComparison.OrdinalIgnoreCase),
                    false, false, false, false))
                .ToList());
        }

        public Task<IMailFolderSession> OpenFolderAsync(string fullName, bool readWrite, CancellationToken ct)
        {
            _factory.OpenedFolders.Add(fullName);
            if (!_factory.Folders.TryGetValue(fullName, out var state) || state.FailOpen)
                throw new InvalidOperationException($"Folder '{fullName}' not found.");
            // One selected folder per connection: selecting another closes this one.
            _selected?.Close();
            var session = new FakeMailFolderSession(_factory, fullName, state);
            _selected = session;
            return Task.FromResult<IMailFolderSession>(session);
        }

        public ValueTask DisposeAsync() => ValueTask.CompletedTask;
    }

    private sealed class FakeMailFolderSession : IMailFolderSession
    {
        private readonly FakeMailSessionFactory _factory;
        private readonly FakeMailFolderState _state;

        public FakeMailFolderSession(FakeMailSessionFactory factory, string fullName, FakeMailFolderState state)
        {
            _factory = factory;
            FullName = fullName;
            _state = state;
        }

        public string FullName { get; }
        public uint UidValidity => _state.UidValidity;
        public bool IsOpen { get; private set; } = true;

        public void Close() => IsOpen = false;

        private void RequireOpen()
        {
            if (!IsOpen)
                throw new InvalidOperationException($"Folder '{FullName}' is not open.");
        }

        public Task<IReadOnlyList<uint>> SearchAllAsync(CancellationToken ct)
        {
            RequireOpen();
            if (_state.FailSearch) throw new IOException("Simulated SEARCH failure.");
            return Task.FromResult<IReadOnlyList<uint>>(_state.Messages.Keys.OrderBy(u => u).ToList());
        }

        public Task<IReadOnlyList<RemoteMessageSummary>> FetchSummariesAsync(IReadOnlyList<uint> uids, CancellationToken ct)
        {
            RequireOpen();
            if (_state.FailFetch) throw new IOException("Simulated FETCH failure.");
            if (_state.DropSummaries is not null)
                uids = uids.Where(u => !_state.DropSummaries.Contains(u)).ToList();
            var summaries = uids
                .Where(u => _state.Messages.ContainsKey(u))
                .Select(u => new RemoteMessageSummary(
                    u,
                    _state.Messages[u].MessageId,
                    _state.Messages[u].Seen ? new[] { "Seen" } : Array.Empty<string>(),
                    DateTimeOffset.UtcNow,
                    1024))
                .ToList();
            return Task.FromResult<IReadOnlyList<RemoteMessageSummary>>(summaries);
        }

        public Task<MimeMessage> GetMessageAsync(uint uid, CancellationToken ct)
        {
            RequireOpen();
            if (_state.FailGetMessage) throw new IOException("Simulated body fetch failure.");
            if (_state.FailGetUids.Contains(uid)) throw new IOException($"Simulated body fetch failure for UID {uid}.");
            if (_state.CancelGetUids.Contains(uid)) throw new OperationCanceledException();
            if (!_state.Messages.TryGetValue(uid, out var message))
                throw new InvalidOperationException($"UID {uid} not found.");
            // Fetching a body marks the message read on the real host; mirror that so
            // unread-restoration is exercised.
            message.Seen = true;
            return Task.FromResult(message.BuildMime());
        }

        public async Task SetSeenAsync(IReadOnlyList<uint> uids, bool read, CancellationToken ct)
        {
            RequireOpen();
            if (_state.FailSetSeen) throw new IOException("Simulated flag update failure.");
            if (_state.CancelOnSetSeen) throw new OperationCanceledException();
            if (_state.OnSetSeen is not null) await _state.OnSetSeen();
            _factory.SeenCalls.Add((FullName, uids.ToList(), read));
            foreach (var uid in uids)
            {
                if (_state.Messages.TryGetValue(uid, out var message))
                    message.Seen = read;
            }
        }

        public Task<IReadOnlyDictionary<uint, uint>?> MoveToAsync(IReadOnlyList<uint> uids, string destinationFullName, CancellationToken ct)
        {
            RequireOpen();
            if (_state.FailMove) throw new IOException($"Simulated MOVE failure in {FullName}.");
            if (_state.CancelOnMove) throw new OperationCanceledException();
            // The destination is resolved without selecting it: the source stays open.
            var dest = _factory.Folder(destinationFullName);
            _factory.Moves.Add((FullName, uids.ToList(), destinationFullName));
            var map = new Dictionary<uint, uint>();
            foreach (var uid in uids.ToList())
            {
                if (_state.Messages.Remove(uid, out var message))
                {
                    dest.Messages[uid] = message;
                    map[uid] = uid;
                }
            }
            if (_state.NullMoveMap || !_factory.SupportsMoveMapping)
                return Task.FromResult<IReadOnlyDictionary<uint, uint>?>(null);
            return Task.FromResult<IReadOnlyDictionary<uint, uint>?>(map);
        }

        public Task<uint?> FindUidByMessageIdAsync(string messageId, CancellationToken ct)
        {
            RequireOpen();
            foreach (var (uid, message) in _state.Messages)
            {
                if (string.Equals(message.MessageId, messageId, StringComparison.Ordinal))
                    return Task.FromResult<uint?>(uid);
            }
            return Task.FromResult<uint?>(null);
        }

        public ValueTask DisposeAsync()
        {
            Close();
            return ValueTask.CompletedTask;
        }
    }

    /// <summary>Builds a minimal MIME message for a fake UID.</summary>
    public static MimeMessage BuildMime(string messageId, string subject, string from, bool withAttachment = false)
    {
        var mime = new MimeMessage();
        mime.MessageId = messageId;
        mime.Subject = subject;
        mime.From.Add(MailboxAddress.Parse(from));
        mime.To.Add(MailboxAddress.Parse("receiver@test.local"));
        mime.Date = DateTimeOffset.UtcNow;
        if (withAttachment)
        {
            var body = new TextPart("plain") { Text = "see attached" };
            var multipart = new Multipart("mixed") { body };
            multipart.Add(new MimePart("text", "plain")
            {
                Content = new MimeContent(new MemoryStream("attachment-bytes"u8.ToArray())),
                ContentDisposition = new ContentDisposition(ContentDisposition.Attachment),
                FileName = "note.txt"
            });
            mime.Body = multipart;
        }
        else
        {
            mime.Body = new TextPart("plain") { Text = "hello" };
        }
        return mime;
    }
}

/// <summary>Scripted SMTP transport: records deliveries and fails on demand.</summary>
public sealed class FakeSmtpTransport : ISmtpTransport
{
    private readonly object _lock = new();
    public List<MimeMessage> Sent { get; } = new();
    /// <summary>Return an exception to throw after recording, or null to accept.</summary>
    public Func<MimeMessage, Exception?>? OnSend { get; set; }

    public int SendCount
    {
        get { lock (_lock) return Sent.Count; }
    }

    public Task SendAsync(MailboxConnection connection, MimeMessage message, CancellationToken ct)
    {
        Exception? failure;
        lock (_lock)
        {
            Sent.Add(message);
            failure = OnSend?.Invoke(message);
        }
        if (failure is not null) throw failure;
        return Task.CompletedTask;
    }
}

/// <summary>Scripted sent-copy filer: records filings and fails on demand.</summary>
public sealed class FakeSentCopyFiler : ISentCopyFiler
{
    public int FileCount { get; private set; }
    public bool ThrowOnFile { get; set; }

    public Task FileAsync(MailboxConnection connection, MimeMessage mime, CancellationToken ct)
    {
        FileCount++;
        if (ThrowOnFile) throw new IOException("Simulated filing failure.");
        return Task.CompletedTask;
    }
}
