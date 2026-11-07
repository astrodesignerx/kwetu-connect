using System.Text;
using MailKit;
using MailKit.Net.Imap;
using MailKit.Net.Smtp;
using MailKit.Search;
using MailKit.Security;
using MimeKit;

namespace MailSpike;

/// <summary>
/// Seeds the (currently empty) spike mailbox with a synthetic client conversation so
/// threading can be proven against genuinely IMAP-fetched messages on the real server.
/// Client-originated messages are IMAP-APPENDed to INBOX (simulating received mail);
/// the creatives account's replies go out over real SMTP (delivered back to its own
/// INBOX) with a copy APPENDed to INBOX.Sent, mirroring a real mail client's behavior.
/// All Message-Ids carry a 'spike-' marker, so seeding is idempotent and cleanup is easy.
/// Expected result after sync: 4 seeded threads (one 6-member, one 3-member,
/// two subject-merged members, one singleton) plus the pre-existing welcome message.
/// </summary>
public static class SeedData
{
    private const string Marker = "spike-";

    public static async Task RunAsync(SpikeConfig cfg)
    {
        var seed = BuildMessages();

        using var imap = new ImapClient();
        await imap.ConnectAsync(cfg.ImapHost, cfg.ImapPort, SecureSocketOptions.SslOnConnect);
        await imap.AuthenticateAsync(cfg.Email, cfg.Password);

        await imap.Inbox.OpenAsync(FolderAccess.ReadWrite);
        var existing = await imap.Inbox.SearchAsync(SearchQuery.HeaderContains("Message-Id", Marker));
        if (existing.Count > 0)
        {
            Console.WriteLine($"Seed skipped: {existing.Count} spike messages already present on the server.");
            return;
        }

        foreach (var (msg, flags) in seed.ClientMessages)
        {
            await imap.Inbox.AppendAsync(msg, flags);
            Console.WriteLine($"  INBOX appended: {msg.Subject}");
        }

        using var smtp = new SmtpClient();
        await smtp.ConnectAsync(cfg.SmtpHost, cfg.SmtpPort, SecureSocketOptions.SslOnConnect);
        await smtp.AuthenticateAsync(cfg.Email, cfg.Password);
        // Headers keep the fictional client in To: for realism, but the envelope
        // sender/recipient are the spike mailbox itself — nothing leaves the server.
        var self = new MailboxAddress("", cfg.Email);
        foreach (var msg in seed.OwnReplies)
        {
            await smtp.SendAsync(msg, self, new[] { self });
            Console.WriteLine($"  SMTP sent (envelope to self): {msg.Subject}");
        }
        await smtp.DisconnectAsync(true);

        var sent = imap.GetFolder(SpecialFolder.Sent);
        await sent.OpenAsync(FolderAccess.ReadWrite);
        foreach (var msg in seed.OwnReplies)
            await sent.AppendAsync(msg, MessageFlags.Seen);
        Console.WriteLine($"  {seed.OwnReplies.Count} copies appended to {sent.FullName}.");

        await imap.DisconnectAsync(true);

        Console.WriteLine("Seed complete. Waiting 5s for local delivery, then re-run: dotnet run --project tools/MailSpike -- sync");
        await Task.Delay(TimeSpan.FromSeconds(5));
    }

    /// <summary>Expunges every spike- message from INBOX and Sent (cleanup / re-seed).</summary>
    public static async Task CleanAsync(SpikeConfig cfg)
    {
        using var imap = new ImapClient();
        await imap.ConnectAsync(cfg.ImapHost, cfg.ImapPort, SecureSocketOptions.SslOnConnect);
        await imap.AuthenticateAsync(cfg.Email, cfg.Password);

        var folders = new List<IMailFolder> { imap.Inbox, imap.GetFolder(SpecialFolder.Sent) };
        foreach (var folder in folders)
        {
            await folder.OpenAsync(FolderAccess.ReadWrite);
            var uids = await folder.SearchAsync(SearchQuery.HeaderContains("Message-Id", Marker));
            if (uids.Count > 0)
            {
                await folder.AddFlagsAsync(uids, MessageFlags.Deleted, true);
                await folder.ExpungeAsync();
                Console.WriteLine($"  {folder.FullName}: expunged {uids.Count} spike messages.");
            }
            else
            {
                Console.WriteLine($"  {folder.FullName}: no spike messages.");
            }
            await folder.CloseAsync();
        }
        await imap.DisconnectAsync(true);
    }

    private sealed record SeedMessages(
        List<(MimeMessage Msg, MessageFlags Flags)> ClientMessages,
        List<MimeMessage> OwnReplies);

    private static SeedMessages BuildMessages()
    {
        var own = new MailboxAddress("Kwetu Creatives", "creatives@kwetuconnectads.co.ke");
        var jane = new MailboxAddress("Jane Wanjiru", "jane.wanjiru@riverdaleapts.co.ke");
        var finance = new MailboxAddress("Finance Desk", "billing@riverdaleapts.co.ke");
        var peter = new MailboxAddress("Peter Otieno", "peter@savannahsafaris.com");
        var newsletter = new MailboxAddress("Design Weekly", "newsletter@designweekly.example.com");

        var now = DateTimeOffset.UtcNow;

        MimeMessage M(MailboxAddress from, MailboxAddress to, string subject, DateTimeOffset date,
            string id, string? inReplyTo, string[] references, string body, bool withAttachment = false)
        {
            var msg = new MimeMessage();
            msg.From.Add(from);
            msg.To.Add(to);
            msg.Subject = subject;
            msg.Date = date;
            msg.MessageId = $"<{Marker}{id}@{from.Address.Split('@')[1]}>";
            if (inReplyTo is not null) msg.InReplyTo = inReplyTo;
            foreach (var r in references) msg.References.Add(r);

            MimeEntity content = new TextPart("plain") { Text = body };
            if (withAttachment)
            {
                var attachment = new MimePart("text", "plain")
                {
                    Content = new MimeContent(new MemoryStream(Encoding.UTF8.GetBytes(
                        "Riverdale Apartments website redesign — brief summary (spike test attachment)."))),
                    ContentDisposition = new ContentDisposition(ContentDisposition.Attachment),
                    FileName = "brief-summary.txt"
                };
                content = new Multipart("mixed") { content, attachment };
            }
            msg.Body = content;
            return msg;
        }

        // Thread A: 4-message client conversation about a project.
        var a1 = M(jane, own, "Website redesign inquiry — Riverdale Apartments", now.AddDays(-14),
            "a1", null, Array.Empty<string>(),
            "Hello Kwetu team,\n\nWe'd like a quote for redesigning the Riverdale Apartments website. " +
            "Are you available for a call this week?\n\nJane");
        var a2 = M(own, jane, "Re: Website redesign inquiry — Riverdale Apartments", now.AddDays(-13),
            "a2", a1.MessageId, new[] { a1.MessageId },
            "Hi Jane,\n\nThanks for reaching out. We'd be glad to help. " +
            "Could you share your current site URL and timeline?\n\nKwetu Creatives");
        var a3 = M(jane, own, "Re: Website redesign inquiry — Riverdale Apartments", now.AddDays(-11),
            "a3", a2.MessageId, new[] { a1.MessageId, a2.MessageId },
            "Hi,\n\nCurrent site is riverdaleapts.example, timeline is Q4. " +
            "Budget range is flexible — what do you need from us to start?\n\nJane");
        var a4 = M(own, jane, "Re: Website redesign inquiry — Riverdale Apartments", now.AddDays(-10),
            "a4", a3.MessageId, new[] { a1.MessageId, a2.MessageId, a3.MessageId },
            "Hi Jane,\n\nAttached is our brief summary. We'll send a formal proposal Friday.\n\nKwetu Creatives",
            withAttachment: true);

        // Thread B: 2-message invoice exchange.
        var b1 = M(finance, own, "Invoice #1042 — March campaign", now.AddDays(-8),
            "b1", null, Array.Empty<string>(),
            "Hello,\n\nPlease find invoice #1042 for the March campaign. Payment due in 14 days.\n\nFinance Desk");
        var b2 = M(own, finance, "Re: Invoice #1042 — March campaign", now.AddDays(-7),
            "b2", b1.MessageId, new[] { b1.MessageId },
            "Hello,\n\nReceived, thank you. Payment will be processed this week.\n\nKwetu Creatives");

        // Thread C: unrelated singleton.
        var c1 = M(newsletter, own, "Your newsletter subscription is confirmed", now.AddDays(-5),
            "c1", null, Array.Empty<string>(),
            "You're subscribed to Design Weekly. Unsubscribe anytime.");

        // Thread D: two messages with matching subject but NO reference headers
        // (simulates a naive mail client) — must merge via subject fallback.
        var d1 = M(peter, own, "Quick question", now.AddDays(-4),
            "d1", null, Array.Empty<string>(),
            "Hi team, do you also handle social media management?\n\nPeter");
        var d2 = M(own, peter, "Re: Quick question", now.AddDays(-4).AddHours(2),
            "d2", null, Array.Empty<string>(),
            "Hi Peter,\n\nYes — we offer full social media management packages.\n\nKwetu Creatives");

        // Client-originated mail goes straight to INBOX; one left unread for flag variety.
        var clientMessages = new List<(MimeMessage, MessageFlags)>
        {
            (a1, MessageFlags.Seen),
            (a3, MessageFlags.None),   // unread on purpose
            (b1, MessageFlags.Seen),
            (c1, MessageFlags.Seen),
            (d1, MessageFlags.Seen),
        };
        // The creatives account's own replies: real SMTP send (delivers to INBOX) + Sent copy.
        var ownReplies = new List<MimeMessage> { a2, a4, b2, d2 };

        return new SeedMessages(clientMessages, ownReplies);
    }
}
