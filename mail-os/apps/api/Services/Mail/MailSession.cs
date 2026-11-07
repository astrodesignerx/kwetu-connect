using Kompanion.Api.Data;
using MailKit;
using MailKit.Net.Imap;
using MailKit.Search;
using MailKit.Security;
using MimeKit;

namespace Kompanion.Api.Services.Mail;

/// <summary>
/// What sync and mail actions need to know about a remote folder, without
/// leaking MailKit types into the services. The production implementation below
/// talks MailKit; tests substitute an in-memory fake through
/// <see cref="IMailSessionFactory"/>.
/// </summary>
public sealed record RemoteFolderDescriptor(
    string FullName,
    bool NoSelect,
    bool IsInbox,
    bool HasSent,
    bool HasDrafts,
    bool HasTrash,
    bool HasJunk,
    bool HasArchive);

/// <summary>Envelope-level summary for one remote message.</summary>
public sealed record RemoteMessageSummary(
    uint Uid,
    string? MessageId,
    string[] Flags,
    DateTimeOffset? InternalDate,
    long? Size);

/// <summary>
/// One opened remote folder. Always opened by <see cref="IMailSession"/> (the Inbox
/// included) so callers cannot apply stored UIDs to a folder that was never opened.
/// Only one folder is ever selected on the underlying connection: resolving a move
/// destination never selects it. Disposal closes the folder.
/// </summary>
public interface IMailFolderSession : IAsyncDisposable
{
    string FullName { get; }
    uint UidValidity { get; }
    Task<IReadOnlyList<uint>> SearchAllAsync(CancellationToken ct);
    Task<IReadOnlyList<RemoteMessageSummary>> FetchSummariesAsync(IReadOnlyList<uint> uids, CancellationToken ct);
    Task<MimeMessage> GetMessageAsync(uint uid, CancellationToken ct);
    Task SetSeenAsync(IReadOnlyList<uint> uids, bool read, CancellationToken ct);
    /// <summary>
    /// Moves UIDs to the named folder. The destination is resolved without
    /// selecting it, so the source stays open. Returns the server-reported
    /// source-to-destination UID map, or null when the server does not report one.
    /// </summary>
    Task<IReadOnlyDictionary<uint, uint>?> MoveToAsync(IReadOnlyList<uint> uids, string destinationFullName, CancellationToken ct);
    /// <summary>First UID in this folder carrying the Message-ID, if any.</summary>
    Task<uint?> FindUidByMessageIdAsync(string messageId, CancellationToken ct);
}

public interface IMailSession : IAsyncDisposable
{
    Task<IReadOnlyList<RemoteFolderDescriptor>> ListFoldersAsync(CancellationToken ct);
    /// <exception cref="MailKit.FolderNotFoundException">The folder does not exist.</exception>
    Task<IMailFolderSession> OpenFolderAsync(string fullName, bool readWrite, CancellationToken ct);
    /// <summary>Whether the server can report moved UIDs (UIDPLUS MOVE).</summary>
    bool SupportsMoveMapping { get; }
}

public interface IMailSessionFactory
{
    Task<IMailSession> ConnectAsync(MailboxConnection connection, CancellationToken ct);
}

/// <summary>Production <see cref="IMailSessionFactory"/> over MailKit.</summary>
public sealed class MailKitMailSessionFactory : IMailSessionFactory
{
    private readonly ImapConnectionFactory _factory;

    public MailKitMailSessionFactory(ImapConnectionFactory factory) => _factory = factory;

    public async Task<IMailSession> ConnectAsync(MailboxConnection connection, CancellationToken ct) =>
        new MailKitMailSession(await _factory.ConnectAsync(connection, ct));
}

internal sealed class MailKitMailSession : IMailSession
{
    private readonly ImapClient _client;

    public MailKitMailSession(ImapClient client) => _client = client;

    /// <summary>True when the server advertises MOVE, which reports moved UIDs.</summary>
    public bool SupportsMoveMapping =>
        _client.Capabilities.HasFlag(ImapCapabilities.Move);

    public async Task<IReadOnlyList<RemoteFolderDescriptor>> ListFoldersAsync(CancellationToken ct)
    {
        // Namespace roots cannot be listed by asking for their subfolders (the root
        // is never opened), so list each namespace directly and recurse from there.
        // Errors propagate: a failed discovery is an honest sync failure, not an
        // silently partial folder list.
        var all = new List<IMailFolder>();
        foreach (var ns in _client.PersonalNamespaces)
            all.AddRange(await _client.GetFoldersAsync(ns, false, ct));
        all.Add(_client.Inbox);
        var seen = new HashSet<string>(StringComparer.Ordinal);
        var ordered = new List<IMailFolder>();
        foreach (var folder in all)
            await CollectAsync(folder, ordered, seen, ct);
        return ordered.Select(Describe).ToList();
    }

    public async Task<IMailFolderSession> OpenFolderAsync(string fullName, bool readWrite, CancellationToken ct)
    {
        var folder = fullName.Equals("INBOX", StringComparison.OrdinalIgnoreCase)
            ? _client.Inbox
            : await _client.GetFolderAsync(fullName, ct);
        await folder.OpenAsync(readWrite ? FolderAccess.ReadWrite : FolderAccess.ReadOnly, ct);
        return new MailKitMailFolderSession(this, folder);
    }

    /// <summary>
    /// Resolves a folder object without selecting it. Selecting the destination on
    /// the same connection would close the source folder; MOVE only needs the
    /// destination name, so this stays unopened.
    /// </summary>
    internal Task<IMailFolder> GetDestinationAsync(string fullName, CancellationToken ct) =>
        fullName.Equals("INBOX", StringComparison.OrdinalIgnoreCase)
            ? Task.FromResult<IMailFolder>(_client.Inbox)
            : _client.GetFolderAsync(fullName, ct);

    private static async Task CollectAsync(IMailFolder folder, List<IMailFolder> acc,
        HashSet<string> seen, CancellationToken ct)
    {
        if (!seen.Add(folder.FullName)) return;
        acc.Add(folder);
        foreach (var sub in await folder.GetSubfoldersAsync(false, ct))
            await CollectAsync(sub, acc, seen, ct);
    }

    private static RemoteFolderDescriptor Describe(IMailFolder f)
    {
        var a = f.Attributes;
        return new RemoteFolderDescriptor(
            f.FullName,
            a.HasFlag(FolderAttributes.NoSelect),
            a.HasFlag(FolderAttributes.Inbox) || f.FullName.Equals("INBOX", StringComparison.OrdinalIgnoreCase),
            a.HasFlag(FolderAttributes.Sent),
            a.HasFlag(FolderAttributes.Drafts),
            a.HasFlag(FolderAttributes.Trash),
            a.HasFlag(FolderAttributes.Junk),
            a.HasFlag(FolderAttributes.Archive));
    }

    public async ValueTask DisposeAsync()
    {
        try
        {
            if (_client.IsConnected)
                await _client.DisconnectAsync(true, CancellationToken.None);
        }
        catch { /* a failed QUIT must not mask the work that preceded it */ }
        _client.Dispose();
    }
}

internal sealed class MailKitMailFolderSession : IMailFolderSession
{
    private static readonly MessageSummaryItems SummaryItems =
        MessageSummaryItems.Envelope | MessageSummaryItems.Flags |
        MessageSummaryItems.InternalDate | MessageSummaryItems.Size;

    private readonly MailKitMailSession _session;
    private readonly IMailFolder _folder;

    public MailKitMailFolderSession(MailKitMailSession session, IMailFolder folder)
    {
        _session = session;
        _folder = folder;
    }

    public string FullName => _folder.FullName;
    public uint UidValidity => _folder.UidValidity;

    public async Task<IReadOnlyList<uint>> SearchAllAsync(CancellationToken ct) =>
        (await _folder.SearchAsync(SearchQuery.All, ct)).Select(u => u.Id).ToList();

    public async Task<IReadOnlyList<RemoteMessageSummary>> FetchSummariesAsync(
        IReadOnlyList<uint> uids, CancellationToken ct)
    {
        if (uids.Count == 0) return Array.Empty<RemoteMessageSummary>();
        var fetched = await _folder.FetchAsync(
            uids.Select(u => new UniqueId(u)).ToList(), SummaryItems, ct);
        return fetched.Select(s => new RemoteMessageSummary(
            s.UniqueId.Id,
            s.Envelope?.MessageId,
            FlagsToStrings(s),
            s.InternalDate?.ToUniversalTime(),
            s.Size is uint sz ? (long)sz : null)).ToList();
    }

    public Task<MimeMessage> GetMessageAsync(uint uid, CancellationToken ct) =>
        _folder.GetMessageAsync(new UniqueId(uid), ct);

    public async Task SetSeenAsync(IReadOnlyList<uint> uids, bool read, CancellationToken ct)
    {
        if (uids.Count == 0) return;
        var ids = uids.Select(u => new UniqueId(u)).ToList();
        if (read) await _folder.AddFlagsAsync(ids, MessageFlags.Seen, true, ct);
        else await _folder.RemoveFlagsAsync(ids, MessageFlags.Seen, true, ct);
    }

    public async Task<IReadOnlyDictionary<uint, uint>?> MoveToAsync(
        IReadOnlyList<uint> uids, string destinationFullName, CancellationToken ct)
    {
        if (uids.Count == 0) return new Dictionary<uint, uint>();
        var dest = await _session.GetDestinationAsync(destinationFullName, ct);
        var map = await _folder.MoveToAsync(uids.Select(u => new UniqueId(u)).ToList(), dest, ct);
        return map?.ToDictionary(kvp => kvp.Key.Id, kvp => kvp.Value.Id);
    }

    public async Task<uint?> FindUidByMessageIdAsync(string messageId, CancellationToken ct)
    {
        if (string.IsNullOrEmpty(messageId)) return null;
        var found = await _folder.SearchAsync(SearchQuery.HeaderContains("Message-ID", messageId), ct);
        return found.Count == 0 ? null : found[0].Id;
    }

    public async ValueTask DisposeAsync()
    {
        try { if (_folder.IsOpen) await _folder.CloseAsync(false, CancellationToken.None); }
        catch { /* best effort on shutdown */ }
    }

    private static string[] FlagsToStrings(IMessageSummary summary)
    {
        var flags = new List<string>();
        if (summary.Flags is { } f && f != MessageFlags.None)
            flags.AddRange(f.ToString().Split(',').Select(s => s.Trim()));
        if (summary.Keywords is not null)
            flags.AddRange(summary.Keywords);
        return flags.ToArray();
    }
}
