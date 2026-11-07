using Npgsql;

namespace MailSpike;

/// <summary>Prints the exit-criteria proof: counts, top threads, and one full thread tree from Postgres.</summary>
public static class Verifier
{
    public static async Task PrintAsync(Db db, int mailboxId)
    {
        await using var con = db.CreateConnection();

        Console.WriteLine();
        Console.WriteLine("=== Spike verification ===");

        await using (var cmd = new NpgsqlCommand(
            @"SELECT f.name, COUNT(*) FROM messages m
              JOIN folders f ON f.id = m.folder_id
              WHERE m.mailbox_id = @m GROUP BY f.name ORDER BY f.name", con))
        {
            cmd.Parameters.AddWithValue("m", mailboxId);
            await using var r = await cmd.ExecuteReaderAsync();
            while (await r.ReadAsync())
                Console.WriteLine($"Folder {r.GetString(0)}: {r.GetInt64(1)} messages");
        }

        await using (var cmd = new NpgsqlCommand(
            @"SELECT (SELECT COUNT(*) FROM messages WHERE mailbox_id = @m),
                     (SELECT COUNT(*) FROM threads  WHERE mailbox_id = @m),
                     (SELECT COUNT(*) FROM threads  WHERE mailbox_id = @m AND message_count > 1),
                     (SELECT COUNT(*) FROM messages WHERE mailbox_id = @m AND thread_id IS NULL)", con))
        {
            cmd.Parameters.AddWithValue("m", mailboxId);
            await using var r = await cmd.ExecuteReaderAsync();
            if (await r.ReadAsync())
            {
                Console.WriteLine($"Total messages: {r.GetInt64(0)}");
                Console.WriteLine($"Threads: {r.GetInt64(1)} (multi-message: {r.GetInt64(2)})");
                Console.WriteLine($"Messages without a thread: {r.GetInt64(3)}");
            }
        }

        int? largestThreadId = null;
        Console.WriteLine();
        Console.WriteLine("Top threads by message count:");
        await using (var cmd = new NpgsqlCommand(
            @"SELECT id, COALESCE(subject, '(no subject)'), message_count, last_date
              FROM threads WHERE mailbox_id = @m
              ORDER BY message_count DESC, last_date DESC NULLS LAST LIMIT 10", con))
        {
            cmd.Parameters.AddWithValue("m", mailboxId);
            await using var r = await cmd.ExecuteReaderAsync();
            var rank = 0;
            while (await r.ReadAsync())
            {
                rank++;
                if (rank == 1) largestThreadId = r.GetInt32(0);
                var last = r.IsDBNull(3) ? "-" : r.GetDateTime(3).ToString("yyyy-MM-dd HH:mm");
                Console.WriteLine($"  {rank,2}. [{r.GetInt32(2),3} msgs] {Truncate(r.GetString(1), 70)}  (last: {last})");
            }
        }

        if (largestThreadId is not null)
        {
            Console.WriteLine();
            Console.WriteLine($"Largest thread (id {largestThreadId}), chronological with reply depth:");
            var rows = new List<(string? MsgId, string? InReplyTo, string From, string Subject, DateTime? Date, string Flags)>();
            await using (var cmd = new NpgsqlCommand(
                @"SELECT message_id, in_reply_to, COALESCE(from_addr, '?'), COALESCE(subject, '(no subject)'),
                         COALESCE(message_date, internal_date), COALESCE(array_to_string(flags, ','), '')
                  FROM messages WHERE thread_id = @t
                  ORDER BY COALESCE(message_date, internal_date)", con))
            {
                cmd.Parameters.AddWithValue("t", largestThreadId.Value);
                await using var r = await cmd.ExecuteReaderAsync();
                while (await r.ReadAsync())
                    rows.Add((r.IsDBNull(0) ? null : r.GetString(0),
                              r.IsDBNull(1) ? null : r.GetString(1),
                              r.GetString(2), r.GetString(3),
                              r.IsDBNull(4) ? null : r.GetDateTime(4),
                              r.GetString(5)));
            }

            var byMsgId = rows.Where(x => x.MsgId is not null)
                              .GroupBy(x => x.MsgId!)
                              .ToDictionary(g => g.Key, g => g.First());
            int DepthOf((string? MsgId, string? InReplyTo, string, string, DateTime?, string) row)
            {
                var depth = 0;
                var cur = row.InReplyTo;
                var guard = 0;
                while (cur is not null && byMsgId.TryGetValue(cur, out var parent) && guard++ < 20)
                {
                    depth++;
                    cur = parent.InReplyTo;
                }
                return depth;
            }

            foreach (var row in rows)
            {
                var depth = Math.Min(DepthOf(row), 8);
                var indent = new string(' ', depth * 2);
                var date = row.Date?.ToString("MM-dd HH:mm") ?? "-- --";
                Console.WriteLine($"  {indent}{date}  {Truncate(row.From, 28),-28}  {Truncate(row.Subject, 50)}  [{row.Flags}]");
            }
        }

        Console.WriteLine();
        Console.WriteLine("Sample raw query you can run yourself:");
        Console.WriteLine("  SELECT subject, message_count, last_date FROM threads ORDER BY last_date DESC;");
    }

    private static string Truncate(string s, int max) =>
        s.Length <= max ? s : s[..(max - 1)] + "…";
}
