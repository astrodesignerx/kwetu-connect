using System.Security.Cryptography;
using System.Text.RegularExpressions;

namespace Kompanion.Api.Services.Mail;

public sealed record ThreadInput(
    long DbId,
    string? MessageId,
    string? InReplyTo,
    string[] References,
    string? Subject,
    string? NormalizedSubject,
    DateTimeOffset? Date,
    string? FromAddr,
    string? Snippet,
    bool Unread,
    bool HasAttachments);

public sealed record ThreadResult(
    Guid Id,
    string RootKey,
    string? NormalizedSubject,
    string? Subject,
    DateTimeOffset? FirstDate,
    DateTimeOffset? LastDate,
    string? Participants,
    string? Snippet,
    bool HasUnread,
    bool HasAttachments,
    List<long> MemberDbIds);

/// <summary>
/// Simplified JWZ threading (proven in the Phase 0 spike): reference chains from
/// References / In-Reply-To headers, then merge roots sharing a normalized subject.
/// Multiple DB rows may share one message-id (INBOX + Sent copies) — containers hold
/// lists of rows. Deterministic; threads are rebuilt from scratch after each sync.
/// </summary>
public static class ThreadBuilder
{
    private static readonly Regex ReplyPrefix =
        new(@"^\s*(?:(?:re|fw|fwd)\s*:\s*)+", RegexOptions.IgnoreCase | RegexOptions.Compiled);
    private static readonly Regex BracketTag =
        new(@"^\s*\[[^\]]*\]\s*", RegexOptions.Compiled);
    private static readonly Regex Whitespace =
        new(@"\s+", RegexOptions.Compiled);

    public static string? NormalizeSubject(string? subject)
    {
        if (string.IsNullOrWhiteSpace(subject)) return null;
        var s = subject.Trim();
        string prev;
        do
        {
            prev = s;
            s = ReplyPrefix.Replace(s, "");
            s = BracketTag.Replace(s, "");
        } while (s != prev);
        s = Whitespace.Replace(s, " ").Trim();
        return s.Length == 0 ? null : s;
    }

    private sealed class Container
    {
        public required string Id { get; init; }
        public List<ThreadInput> Msgs { get; } = new();
        public Container? Parent { get; set; }
        public List<Container> Children { get; } = new();
    }

    public static List<ThreadResult> BuildThreads(IReadOnlyList<ThreadInput> messages)
    {
        var containers = new Dictionary<string, Container>(StringComparer.Ordinal);

        Container Get(string id)
        {
            if (!containers.TryGetValue(id, out var c))
            {
                c = new Container { Id = id };
                containers[id] = c;
            }
            return c;
        }

        foreach (var msg in messages.OrderBy(m => m.Date ?? DateTimeOffset.MaxValue).ThenBy(m => m.DbId))
        {
            var ownId = string.IsNullOrWhiteSpace(msg.MessageId) ? $"noid:{msg.DbId}" : msg.MessageId!;

            var ids = new List<string>();
            foreach (var r in msg.References)
                if (!string.IsNullOrWhiteSpace(r) && !ids.Contains(r)) ids.Add(r);
            if (!string.IsNullOrWhiteSpace(msg.InReplyTo) && !ids.Contains(msg.InReplyTo!))
                ids.Add(msg.InReplyTo!);
            ids.Add(ownId);

            Container? prev = null;
            foreach (var id in ids)
            {
                var c = Get(id);
                if (id == ownId && !c.Msgs.Any(m => m.DbId == msg.DbId)) c.Msgs.Add(msg);
                if (prev is not null && !ReferenceEquals(prev, c) && c.Parent is null && !IsAncestor(c, prev))
                {
                    c.Parent = prev;
                    prev.Children.Add(c);
                }
                prev = c;
            }
        }

        // Subject fallback for messages without reference headers.
        var roots = containers.Values.Where(c => c.Parent is null).ToList();
        var groups = roots
            .Select(r => (Root: r, NormSubj: r.Msgs.Select(m => m.NormalizedSubject).FirstOrDefault(s => !string.IsNullOrEmpty(s))))
            .Where(x => x.NormSubj is not null)
            .GroupBy(x => x.NormSubj!, StringComparer.OrdinalIgnoreCase)
            .Where(g => g.Count() > 1);
        foreach (var group in groups)
        {
            var canonical = group.OrderBy(x => EarliestDate(x.Root) ?? DateTimeOffset.MaxValue).First().Root;
            foreach (var other in group.Select(x => x.Root).Where(r => !ReferenceEquals(r, canonical)))
            {
                other.Parent = canonical;
                canonical.Children.Add(other);
            }
        }
        roots = containers.Values.Where(c => c.Parent is null).ToList();

        var results = new List<ThreadResult>();
        foreach (var root in roots)
        {
            var members = new List<ThreadInput>();
            var stack = new Stack<Container>();
            stack.Push(root);
            while (stack.Count > 0)
            {
                var c = stack.Pop();
                members.AddRange(c.Msgs);
                foreach (var child in c.Children) stack.Push(child);
            }
            if (members.Count == 0) continue;

            var ordered = members.OrderBy(m => m.Date ?? DateTimeOffset.MaxValue).ToList();
            var dates = ordered.Where(m => m.Date is not null).Select(m => m.Date!.Value).ToList();
            var participants = ordered
                .Select(m => m.FromAddr)
                .Where(a => !string.IsNullOrEmpty(a))
                .Distinct()
                .Take(5);

            results.Add(new ThreadResult(
                Id: ThreadIdFromRootKey(root.Id),
                RootKey: root.Id,
                NormalizedSubject: ordered.Select(m => m.NormalizedSubject).FirstOrDefault(s => !string.IsNullOrEmpty(s)),
                Subject: ordered.Select(m => m.Subject).FirstOrDefault(s => !string.IsNullOrEmpty(s)),
                FirstDate: dates.Count > 0 ? dates.Min() : null,
                LastDate: dates.Count > 0 ? dates.Max() : null,
                Participants: string.Join(", ", participants),
                Snippet: ordered.LastOrDefault(m => !string.IsNullOrEmpty(m.Snippet))?.Snippet,
                HasUnread: members.Any(m => m.Unread),
                HasAttachments: members.Any(m => m.HasAttachments),
                MemberDbIds: members.Select(m => m.DbId).ToList()));
        }
        return results;
    }

    /// <summary>
    /// Derives a stable Guid for a thread from its root key so the same root always
    /// produces the same thread id across rebuilds. SHA-1 of the root key, first 16 bytes.
    /// </summary>
    public static Guid ThreadIdFromRootKey(string rootKey)
    {
        var hash = SHA1.HashData(System.Text.Encoding.UTF8.GetBytes(rootKey));
        return new Guid(hash.AsSpan(0, 16));
    }

    private static bool IsAncestor(Container candidate, Container node)
    {
        var visited = new HashSet<Container>();
        var cur = node.Parent;
        while (cur is not null && visited.Add(cur))
        {
            if (ReferenceEquals(cur, candidate)) return true;
            cur = cur.Parent;
        }
        return false;
    }

    private static DateTimeOffset? EarliestDate(Container c)
    {
        var best = c.Msgs.Select(m => m.Date).Where(d => d is not null).DefaultIfEmpty().Min();
        foreach (var child in c.Children)
        {
            var d = EarliestDate(child);
            if (d is not null && (best is null || d < best)) best = d;
        }
        return best;
    }
}
