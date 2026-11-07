using Npgsql;
using NpgsqlTypes;

namespace MailSpike;

public sealed class MessageRow
{
    public int MailboxId;
    public int FolderId;
    public int Uid;
    public int UidValidity;
    public string? MessageId;
    public string? InReplyTo;
    public string[] References = Array.Empty<string>();
    public string? Subject;
    public string? NormalizedSubject;
    public string? FromName;
    public string? FromAddr;
    public string? ToAddrs;
    public string? CcAddrs;
    public DateTimeOffset? MessageDate;
    public DateTimeOffset? InternalDate;
    public string? Snippet;
    public string? BodyText;
    public string? BodyHtml;
    public string? RawHeaders;
    public string[] Flags = Array.Empty<string>();
    public long? SizeBytes;
    public bool HasAttachments;
    public int AttachmentCount;
    public string? AttachmentMetaJson;
}

public sealed class Db
{
    private readonly string _cs;

    public Db(string connectionString) => _cs = connectionString;

    public NpgsqlConnection CreateConnection()
    {
        var con = new NpgsqlConnection(_cs);
        con.Open();
        return con;
    }

    public async Task EnsureSchemaAsync(string schemaPath)
    {
        var sql = await File.ReadAllTextAsync(schemaPath);
        await using var con = CreateConnection();
        await using var cmd = new NpgsqlCommand(sql, con);
        await cmd.ExecuteNonQueryAsync();
    }

    public async Task<int> UpsertMailboxAsync(string email, string host)
    {
        await using var con = CreateConnection();
        await using var cmd = new NpgsqlCommand(
            @"INSERT INTO mailboxes (email, host) VALUES (@email, @host)
              ON CONFLICT (email) DO UPDATE SET host = EXCLUDED.host
              RETURNING id", con);
        cmd.Parameters.AddWithValue("email", email);
        cmd.Parameters.AddWithValue("host", host);
        return (int)(await cmd.ExecuteScalarAsync())!;
    }

    public async Task<int> UpsertFolderAsync(int mailboxId, string name, int uidValidity)
    {
        await using var con = CreateConnection();
        await using var cmd = new NpgsqlCommand(
            @"INSERT INTO folders (mailbox_id, name, uidvalidity) VALUES (@m, @name, @uv)
              ON CONFLICT (mailbox_id, name) DO UPDATE SET uidvalidity = EXCLUDED.uidvalidity
              RETURNING id", con);
        cmd.Parameters.AddWithValue("m", mailboxId);
        cmd.Parameters.AddWithValue("name", name);
        cmd.Parameters.AddWithValue("uv", uidValidity);
        return (int)(await cmd.ExecuteScalarAsync())!;
    }

    public async Task SetFolderLastUidAsync(int folderId, int lastUid)
    {
        await using var con = CreateConnection();
        await using var cmd = new NpgsqlCommand("UPDATE folders SET last_uid = @u WHERE id = @f", con);
        cmd.Parameters.AddWithValue("u", lastUid);
        cmd.Parameters.AddWithValue("f", folderId);
        await cmd.ExecuteNonQueryAsync();
    }

    /// <summary>Inserts a message; returns false when the (mailbox, folder, uidvalidity, uid) row already exists.</summary>
    public async Task<bool> InsertMessageAsync(MessageRow m)
    {
        await using var con = CreateConnection();
        await using var cmd = new NpgsqlCommand(
            @"INSERT INTO messages (
                  mailbox_id, folder_id, uid, uidvalidity, message_id, in_reply_to, header_references,
                  subject, normalized_subject, from_name, from_addr, to_addrs, cc_addrs,
                  message_date, internal_date, snippet, body_text, body_html, raw_headers,
                  flags, size_bytes, has_attachments, attachment_count, attachment_meta)
              VALUES (
                  @mailbox_id, @folder_id, @uid, @uidvalidity, @message_id, @in_reply_to, @header_references,
                  @subject, @normalized_subject, @from_name, @from_addr, @to_addrs, @cc_addrs,
                  @message_date, @internal_date, @snippet, @body_text, @body_html, @raw_headers,
                  @flags, @size_bytes, @has_attachments, @attachment_count, @attachment_meta)
              ON CONFLICT (mailbox_id, folder_id, uidvalidity, uid) DO NOTHING", con);

        cmd.Parameters.Add(P("mailbox_id", m.MailboxId, NpgsqlDbType.Integer));
        cmd.Parameters.Add(P("folder_id", m.FolderId, NpgsqlDbType.Integer));
        cmd.Parameters.Add(P("uid", m.Uid, NpgsqlDbType.Integer));
        cmd.Parameters.Add(P("uidvalidity", m.UidValidity, NpgsqlDbType.Integer));
        cmd.Parameters.Add(P("message_id", m.MessageId, NpgsqlDbType.Text));
        cmd.Parameters.Add(P("in_reply_to", m.InReplyTo, NpgsqlDbType.Text));
        cmd.Parameters.Add(P("header_references", m.References, NpgsqlDbType.Array | NpgsqlDbType.Text));
        cmd.Parameters.Add(P("subject", m.Subject, NpgsqlDbType.Text));
        cmd.Parameters.Add(P("normalized_subject", m.NormalizedSubject, NpgsqlDbType.Text));
        cmd.Parameters.Add(P("from_name", m.FromName, NpgsqlDbType.Text));
        cmd.Parameters.Add(P("from_addr", m.FromAddr, NpgsqlDbType.Text));
        cmd.Parameters.Add(P("to_addrs", m.ToAddrs, NpgsqlDbType.Text));
        cmd.Parameters.Add(P("cc_addrs", m.CcAddrs, NpgsqlDbType.Text));
        cmd.Parameters.Add(P("message_date", m.MessageDate?.UtcDateTime, NpgsqlDbType.TimestampTz));
        cmd.Parameters.Add(P("internal_date", m.InternalDate?.UtcDateTime, NpgsqlDbType.TimestampTz));
        cmd.Parameters.Add(P("snippet", m.Snippet, NpgsqlDbType.Text));
        cmd.Parameters.Add(P("body_text", m.BodyText, NpgsqlDbType.Text));
        cmd.Parameters.Add(P("body_html", m.BodyHtml, NpgsqlDbType.Text));
        cmd.Parameters.Add(P("raw_headers", m.RawHeaders, NpgsqlDbType.Text));
        cmd.Parameters.Add(P("flags", m.Flags, NpgsqlDbType.Array | NpgsqlDbType.Text));
        cmd.Parameters.Add(P("size_bytes", m.SizeBytes, NpgsqlDbType.Bigint));
        cmd.Parameters.Add(P("has_attachments", m.HasAttachments, NpgsqlDbType.Boolean));
        cmd.Parameters.Add(P("attachment_count", m.AttachmentCount, NpgsqlDbType.Integer));
        cmd.Parameters.Add(P("attachment_meta", m.AttachmentMetaJson, NpgsqlDbType.Jsonb));

        return await cmd.ExecuteNonQueryAsync() == 1;
    }

    public async Task<List<ThreadInput>> LoadMessagesAsync(int mailboxId)
    {
        var result = new List<ThreadInput>();
        await using var con = CreateConnection();
        await using var cmd = new NpgsqlCommand(
            @"SELECT id, message_id, in_reply_to, COALESCE(header_references, '{}'),
                     subject, normalized_subject, COALESCE(message_date, internal_date) AS dt
              FROM messages WHERE mailbox_id = @m", con);
        cmd.Parameters.AddWithValue("m", mailboxId);
        await using var r = await cmd.ExecuteReaderAsync();
        while (await r.ReadAsync())
        {
            result.Add(new ThreadInput(
                DbId: r.GetInt64(0),
                MessageId: r.IsDBNull(1) ? null : r.GetString(1),
                InReplyTo: r.IsDBNull(2) ? null : r.GetString(2),
                References: r.GetFieldValue<string[]>(3),
                Subject: r.IsDBNull(4) ? null : r.GetString(4),
                NormalizedSubject: r.IsDBNull(5) ? null : r.GetString(5),
                Date: r.IsDBNull(6) ? null : r.GetDateTime(6)));
        }
        return result;
    }

    /// <summary>Rebuilds all threads for a mailbox from scratch (safe to re-run after additive ingest).</summary>
    public async Task ReplaceThreadsAsync(int mailboxId, IReadOnlyList<ThreadResult> threads)
    {
        await using var con = CreateConnection();
        await using var tx = await con.BeginTransactionAsync();

        // Null the FK before deleting threads, or the DELETE violates messages_thread_id_fkey.
        await using (var cmd = new NpgsqlCommand("UPDATE messages SET thread_id = NULL WHERE mailbox_id = @m", con, (NpgsqlTransaction)tx))
        {
            cmd.Parameters.AddWithValue("m", mailboxId);
            await cmd.ExecuteNonQueryAsync();
        }
        await using (var cmd = new NpgsqlCommand("DELETE FROM threads WHERE mailbox_id = @m", con, (NpgsqlTransaction)tx))
        {
            cmd.Parameters.AddWithValue("m", mailboxId);
            await cmd.ExecuteNonQueryAsync();
        }

        foreach (var t in threads)
        {
            int threadId;
            await using (var cmd = new NpgsqlCommand(
                @"INSERT INTO threads (mailbox_id, root_key, normalized_subject, subject, message_count, first_date, last_date)
                  VALUES (@m, @rk, @ns, @subj, @count, @first, @last) RETURNING id", con, (NpgsqlTransaction)tx))
            {
                cmd.Parameters.AddWithValue("m", mailboxId);
                cmd.Parameters.Add(P("rk", t.RootKey, NpgsqlDbType.Text));
                cmd.Parameters.Add(P("ns", t.NormalizedSubject, NpgsqlDbType.Text));
                cmd.Parameters.Add(P("subj", t.Subject, NpgsqlDbType.Text));
                cmd.Parameters.AddWithValue("count", t.MemberDbIds.Count);
                cmd.Parameters.Add(P("first", t.FirstDate?.UtcDateTime, NpgsqlDbType.TimestampTz));
                cmd.Parameters.Add(P("last", t.LastDate?.UtcDateTime, NpgsqlDbType.TimestampTz));
                threadId = (int)(await cmd.ExecuteScalarAsync())!;
            }
            await using (var cmd = new NpgsqlCommand(
                "UPDATE messages SET thread_id = @t WHERE id = ANY(@ids)", con, (NpgsqlTransaction)tx))
            {
                cmd.Parameters.AddWithValue("t", threadId);
                cmd.Parameters.Add(P("ids", t.MemberDbIds.ToArray(), NpgsqlDbType.Array | NpgsqlDbType.Bigint));
                await cmd.ExecuteNonQueryAsync();
            }
        }

        await tx.CommitAsync();
    }

    private static NpgsqlParameter P(string name, object? value, NpgsqlDbType type) =>
        new(name, type) { Value = value ?? DBNull.Value };
}
