using System.Net.Security;
using System.Security.Cryptography.X509Certificates;
using System.Text.Json;
using System.Text.RegularExpressions;
using MailKit;
using MailKit.Net.Imap;
using MailKit.Search;
using MailKit.Security;
using MimeKit;

namespace MailSpike;

public sealed class MailIngestor
{
    private readonly SpikeConfig _cfg;

    public MailIngestor(SpikeConfig cfg) => _cfg = cfg;

    public async Task RunAsync(Db db, int mailboxId)
    {
        using var client = new ImapClient();

        // Strict TLS validation first; if the host's cert fails validation, print the details
        // and pin that exact certificate (thumbprint) for this spike session only.
        string? pinnedThumbprint = null;
        client.ServerCertificateValidationCallback = (_, cert, _, errors) =>
        {
            if (errors == SslPolicyErrors.None) return true;
            var c2 = new X509Certificate2(cert!);
            if (pinnedThumbprint is null)
            {
                Console.WriteLine($"!! TLS certificate failed validation: {errors}");
                Console.WriteLine($"!! Subject    = {c2.Subject}");
                Console.WriteLine($"!! Issuer     = {c2.Issuer}");
                Console.WriteLine($"!! Valid until= {c2.NotAfter:u}");
                Console.WriteLine($"!! Thumbprint = {c2.Thumbprint}");
                Console.WriteLine("!! Pinning THIS certificate for the remainder of the spike run.");
                pinnedThumbprint = c2.Thumbprint;
            }
            return c2.Thumbprint == pinnedThumbprint;
        };

        await client.ConnectAsync(_cfg.ImapHost, _cfg.ImapPort, SecureSocketOptions.SslOnConnect);
        Console.WriteLine($"Connected to {_cfg.ImapHost}:{_cfg.ImapPort}.");
        Console.WriteLine($"IMAP IDLE supported: {client.Capabilities.HasFlag(ImapCapabilities.Idle)}");

        await client.AuthenticateAsync(_cfg.Email, _cfg.Password);
        Console.WriteLine("Authenticated.");

        var allFolders = new List<IMailFolder> { client.Inbox };
        await CollectFoldersAsync(client.GetFolder(client.PersonalNamespaces[0]), allFolders);
        await CollectFoldersAsync(client.Inbox, allFolders);
        var distinct = allFolders.GroupBy(f => f.FullName).Select(g => g.First()).ToList();
        Console.WriteLine("Folders on server:");
        foreach (var f in distinct)
            Console.WriteLine($"  {f.FullName}  [{f.Attributes}]");

        // Full-history backfill: sync every selectable folder except Trash/Junk/spam.
        var targets = new List<IMailFolder>();
        foreach (var f in distinct)
        {
            if (f.Attributes.HasFlag(FolderAttributes.NoSelect)) continue;
            if (f.Attributes.HasFlag(FolderAttributes.Trash) || f.Attributes.HasFlag(FolderAttributes.Junk)
                || f.FullName.Contains("spam", StringComparison.OrdinalIgnoreCase))
            {
                Console.WriteLine($"  (excluded from sync: {f.FullName})");
                continue;
            }
            targets.Add(f);
        }
        Console.WriteLine($"Sync targets: {string.Join(", ", targets.Select(t => t.FullName))}");

        var since = DateTime.UtcNow.AddDays(-_cfg.Days);
        foreach (var folder in targets)
            await SyncFolderAsync(folder, db, mailboxId, since);

        await client.DisconnectAsync(true);
    }

    private static async Task CollectFoldersAsync(IMailFolder root, List<IMailFolder> acc)
    {
        IList<IMailFolder> subs;
        try { subs = await root.GetSubfoldersAsync(false); }
        catch { return; }
        foreach (var s in subs)
        {
            acc.Add(s);
            await CollectFoldersAsync(s, acc);
        }
    }

    private static async Task SyncFolderAsync(IMailFolder folder, Db db, int mailboxId, DateTime sinceUtc)
    {
        if (folder.Attributes.HasFlag(FolderAttributes.NoSelect))
        {
            Console.WriteLine($"Skipping {folder.FullName} (not selectable).");
            return;
        }

        // ReadWrite so flag restoration below is permitted. Empirical finding against this
        // Dovecot host: fetching full message bodies sets \Seen server-side even under a
        // read-only open, so we snapshot flags first and restore \Seen afterwards.
        await folder.OpenAsync(FolderAccess.ReadWrite);
        try
        {
            var uidValidity = folder.UidValidity;
            var folderId = await db.UpsertFolderAsync(mailboxId, folder.FullName, (int)uidValidity);

            var uids = await folder.SearchAsync(SearchQuery.DeliveredAfter(sinceUtc));
            Console.WriteLine($"{folder.FullName}: {uids.Count} messages since {sinceUtc:yyyy-MM-dd} (UIDVALIDITY {uidValidity})");
            if (uids.Count == 0) return;

            var summaries = await folder.FetchAsync(uids,
                MessageSummaryItems.Envelope | MessageSummaryItems.Flags |
                MessageSummaryItems.InternalDate | MessageSummaryItems.Size);
            var byUid = new Dictionary<UniqueId, IMessageSummary>();
            foreach (var s in summaries) byUid[s.UniqueId] = s;

            var unseenUids = uids
                .Where(u => byUid.TryGetValue(u, out var s) && !(s.Flags?.HasFlag(MessageFlags.Seen) ?? false))
                .ToList();

            var inserted = 0;
            var failed = 0;
            var done = 0;
            foreach (var uid in uids)
            {
                try
                {
                    var mime = await folder.GetMessageAsync(uid);
                    byUid.TryGetValue(uid, out var summary);
                    var row = MessageMapper.Map(mime, summary, mailboxId, folderId, uid, uidValidity);
                    if (await db.InsertMessageAsync(row)) inserted++;
                }
                catch (Exception ex)
                {
                    failed++;
                    Console.WriteLine($"  !! uid {uid.Id}: {ex.GetType().Name}: {ex.Message}");
                }
                done++;
                if (done % 25 == 0 || done == uids.Count)
                    Console.WriteLine($"  progress {done}/{uids.Count} (new: {inserted}, failed: {failed})");
            }

            if (unseenUids.Count > 0)
            {
                await folder.RemoveFlagsAsync(unseenUids, MessageFlags.Seen, true);
                Console.WriteLine($"  restored unread state for {unseenUids.Count} message(s).");
            }

            await db.SetFolderLastUidAsync(folderId, (int)uids.Max(u => u.Id));
        }
        finally
        {
            if (folder.IsOpen) await folder.CloseAsync();
        }
    }
}

internal static class MessageMapper
{
    private static readonly Regex HtmlTag = new("<[^>]+>", RegexOptions.Compiled);
    private static readonly Regex Whitespace = new(@"\s+", RegexOptions.Compiled);

    public static string? NormalizeId(string? id)
    {
        if (string.IsNullOrWhiteSpace(id)) return null;
        var t = id.Trim();
        if (t.StartsWith('<') && t.EndsWith('>')) t = t[1..^1];
        t = t.Trim();
        return t.Length == 0 ? null : t;
    }

    public static MessageRow Map(MimeMessage mime, IMessageSummary? summary,
        int mailboxId, int folderId, UniqueId uid, uint uidValidity)
    {
        var references = mime.References
            .Select(NormalizeId)
            .Where(s => s is not null)
            .Cast<string>()
            .Distinct()
            .ToArray();

        var from = mime.From?.Mailboxes.FirstOrDefault();

        var attachments = mime.Attachments.ToList();
        var attachmentMeta = attachments.Select(a => new
        {
            name = a.ContentDisposition?.FileName ?? (a as MimePart)?.FileName ?? a.ContentType?.Name,
            contentType = a.ContentType?.MimeType
        }).ToList();

        var flags = new List<string>();
        if (summary?.Flags is { } f && f != MessageFlags.None)
            flags.AddRange(f.ToString().Split(',').Select(s => s.Trim()));
        if (summary?.Keywords is not null)
            flags.AddRange(summary.Keywords);

        return new MessageRow
        {
            MailboxId = mailboxId,
            FolderId = folderId,
            Uid = (int)uid.Id,
            UidValidity = (int)uidValidity,
            MessageId = NormalizeId(mime.MessageId),
            InReplyTo = NormalizeId(mime.InReplyTo),
            References = references,
            Subject = mime.Subject,
            NormalizedSubject = ThreadBuilder.NormalizeSubject(mime.Subject),
            FromName = from?.Name,
            FromAddr = from?.Address,
            ToAddrs = Flatten(mime.To),
            CcAddrs = Flatten(mime.Cc),
            MessageDate = mime.Date == default ? null : mime.Date,
            InternalDate = summary?.InternalDate,
            Snippet = MakeSnippet(mime.TextBody ?? StripHtml(mime.HtmlBody)),
            BodyText = mime.TextBody,
            BodyHtml = mime.HtmlBody,
            RawHeaders = mime.Headers?.ToString(),
            Flags = flags.ToArray(),
            SizeBytes = summary?.Size is uint sz ? (long)sz : null,
            HasAttachments = attachments.Count > 0,
            AttachmentCount = attachments.Count,
            AttachmentMetaJson = attachmentMeta.Count > 0 ? JsonSerializer.Serialize(attachmentMeta) : null
        };
    }

    private static string? Flatten(InternetAddressList? list)
    {
        if (list is null) return null;
        var parts = list.Mailboxes.Select(mb =>
            string.IsNullOrEmpty(mb.Name) ? mb.Address : $"{mb.Name} <{mb.Address}>");
        var joined = string.Join(", ", parts);
        return joined.Length == 0 ? null : joined;
    }

    private static string? StripHtml(string? html) =>
        html is null ? null : Whitespace.Replace(HtmlTag.Replace(html, " "), " ").Trim();

    private static string? MakeSnippet(string? text)
    {
        if (string.IsNullOrWhiteSpace(text)) return null;
        var s = Whitespace.Replace(text, " ").Trim();
        return s.Length <= 200 ? s : s[..200];
    }
}
