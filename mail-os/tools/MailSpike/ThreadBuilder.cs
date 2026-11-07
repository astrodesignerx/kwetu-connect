using System.Text.RegularExpressions;

namespace MailSpike;

public sealed record ThreadInput(
    long DbId,
    string? MessageId,
    string? InReplyTo,
    string[] References,
    string? Subject,
    string? NormalizedSubject,
    DateTimeOffset? Date);

public sealed record ThreadResult(
    string RootKey,
    string? NormalizedSubject,
    string? Subject,
    DateTimeOffset? FirstDate,
    DateTimeOffset? LastDate,
    List<long> MemberDbIds);

/// <summary>
/// Simplified JWZ threading: build reference chains from References / In-Reply-To
/// headers, then merge roots that share a normalized subject (covers messages
/// without reference headers). Deterministic and safe to recompute from scratch.
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
        // Multiple rows can share one message-id (e.g. the INBOX copy and the Sent copy).
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

        // Pass 1: reference chains (JWZ). Containers may exist before their message
        // arrives (dangling references), which handles out-of-order and missing ancestors.
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

        // Pass 2: merge roots that share a normalized subject (mail sent without
        // reference headers). Trade-off: unrelated conversations with identical
        // subjects merge; acceptable for the spike, revisit in production.
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

        // Pass 3: one thread per root; collect subtree members.
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

            var dates = members.Where(m => m.Date is not null).Select(m => m.Date!.Value).ToList();
            var subject = members
                .OrderBy(m => m.Date ?? DateTimeOffset.MaxValue)
                .Select(m => m.Subject)
                .FirstOrDefault(s => !string.IsNullOrEmpty(s));

            results.Add(new ThreadResult(
                RootKey: root.Id,
                NormalizedSubject: members.Select(m => m.NormalizedSubject)
                    .FirstOrDefault(s => !string.IsNullOrEmpty(s)),
                Subject: subject,
                FirstDate: dates.Count > 0 ? dates.Min() : null,
                LastDate: dates.Count > 0 ? dates.Max() : null,
                MemberDbIds: members.Select(m => m.DbId).ToList()));
        }
        return results;
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
