using Kompanion.Api.Data;
using MailKit;
using MailKit.Search;
using MimeKit;

namespace Kompanion.Api.Services.Mail;

/// <summary>
/// Sends one already-built message over SMTP. Returning normally means the server
/// accepted it; anything thrown after the bytes went out leaves the outcome
/// uncertain, which the caller (<see cref="MailComposer"/>) records durably.
/// </summary>
public interface ISmtpTransport
{
    Task SendAsync(MailboxConnection connection, MimeMessage message, CancellationToken ct);
}

/// <summary>Production <see cref="ISmtpTransport"/> over MailKit SMTP.</summary>
public sealed class MailKitSmtpTransport : ISmtpTransport
{
    private readonly SmtpConnectionFactory _factory;
    private readonly ILogger<MailKitSmtpTransport> _log;

    public MailKitSmtpTransport(SmtpConnectionFactory factory, ILogger<MailKitSmtpTransport> log)
    {
        _factory = factory;
        _log = log;
    }

    public async Task SendAsync(MailboxConnection connection, MimeMessage message, CancellationToken ct)
    {
        MailKit.Net.Smtp.SmtpClient client;
        try
        {
            client = await _factory.ConnectAsync(connection, ct);
        }
        catch (OperationCanceledException) { throw; }
        catch (Exception ex)
        {
            // Connect or authentication: nothing was transmitted, so retrying is safe.
            throw new SmtpNotSentException($"Could not reach {connection.SmtpHost}:{connection.SmtpPort}, {ex.Message}", ex);
        }

        using (client)
        {
            await client.SendAsync(message, ct);
            // The server accepted the message when SendAsync returned; a QUIT failure
            // after that is housekeeping noise, never a delivery failure.
            try
            {
                await client.DisconnectAsync(true, ct);
            }
            catch (Exception ex)
            {
                _log.LogWarning(ex, "SMTP disconnect failed for {Mailbox} after acceptance.", connection.Email);
            }
        }
    }
}

/// <summary>
/// Files the sent copy in the mailbox's Sent folder. Never throws: by the time it
/// runs the message has been accepted and is on its way, so a filing problem is
/// bookkeeping, not a send failure.
/// </summary>
public interface ISentCopyFiler
{
    Task FileAsync(MailboxConnection connection, MimeMessage mime, CancellationToken ct);
}

/// <summary>
/// Production <see cref="ISentCopyFiler"/> over IMAP. Appends its own copy only when
/// the server did not already file one (checked by <c>Message-ID</c>), unless
/// <c>Mail:FileSentCopy</c> is <c>false</c>.
/// </summary>
public sealed class ImapSentCopyFiler : ISentCopyFiler
{
    private readonly ImapConnectionFactory _imapFactory;
    private readonly ILogger<ImapSentCopyFiler> _log;
    private readonly bool _fileSentCopy;

    public ImapSentCopyFiler(
        ImapConnectionFactory imapFactory,
        IConfiguration config,
        ILogger<ImapSentCopyFiler> log)
    {
        _imapFactory = imapFactory;
        _log = log;
        _fileSentCopy = config.GetValue("Mail:FileSentCopy", true);
    }

    public async Task FileAsync(MailboxConnection connection, MimeMessage mime, CancellationToken ct)
    {
        if (!_fileSentCopy) return;
        try
        {
            await FileInSentAsync(connection, mime, ct);
        }
        catch (Exception ex)
        {
            _log.LogWarning(ex, "Could not file the sent copy for {Mailbox}.", connection.Email);
        }
    }

    private async Task FileInSentAsync(MailboxConnection connection, MimeMessage mime, CancellationToken ct)
    {
        using var imap = await _imapFactory.ConnectAsync(connection, ct);
        var sent = await ResolveSentFolderAsync(imap, ct);
        if (sent is null)
        {
            _log.LogWarning(
                "No Sent folder found for {Mailbox}; the sent copy was not filed.",
                connection.Email);
            return;
        }

        await sent.OpenAsync(FolderAccess.ReadWrite, ct);

        // Some hosts (cPanel/Exim among them, depending on configuration) save their
        // own copy of an SMTP submission, and some do not. Rather than trusting
        // either behaviour, look for a message carrying our Message-ID: if the host
        // already filed one, appending would leave the mailbox with two copies of the
        // same mail, visible in every other client and in the Sent count.
        if (await AlreadyFiledAsync(sent, mime.MessageId, ct))
        {
            _log.LogInformation(
                "The mail host already saved the sent copy for {Mailbox}; not appending a second one.",
                connection.Email);
            await imap.DisconnectAsync(true, ct);
            return;
        }

        // \Seen because you wrote it: an unread badge on your own outgoing mail is
        // noise. The internal date is the message's own, so the Sent folder sorts
        // by when it was written rather than when it happened to be filed.
        await sent.AppendAsync(mime, MessageFlags.Seen, mime.Date, ct);
        await imap.DisconnectAsync(true, ct);
    }

    /// <summary>
    /// True when the folder already holds a message with this <c>Message-ID</c>.
    ///
    /// A server that does not implement HEADER search throws here; that is treated as
    /// "not filed", because appending a copy we cannot prove is a duplicate is the
    /// harmless direction to fail in (the alternative is losing the Sent copy entirely).
    /// </summary>
    private async Task<bool> AlreadyFiledAsync(IMailFolder sent, string? messageId, CancellationToken ct)
    {
        if (string.IsNullOrEmpty(messageId)) return false;
        try
        {
            var found = await sent.SearchAsync(SearchQuery.HeaderContains("Message-ID", messageId), ct);
            return found.Count > 0;
        }
        catch (Exception ex)
        {
            _log.LogDebug(ex, "Sent-folder duplicate check failed; filing a copy anyway.");
            return false;
        }
    }

    /// <summary>
    /// The Sent folder, by SPECIAL-USE where the server advertises it and by name where
    /// it does not — the same order <see cref="MailIngestor"/> uses to classify folders,
    /// so the folder this writes to is the one the sync reads back as Sent.
    /// </summary>
    private static async Task<IMailFolder?> ResolveSentFolderAsync(MailKit.Net.Imap.ImapClient imap, CancellationToken ct)
    {
        var special = imap.GetFolder(SpecialFolder.Sent);
        if (special is not null) return special;

        foreach (var ns in imap.PersonalNamespaces)
        {
            // GetFoldersAsync lists the namespace without needing it opened first;
            // asking a namespace root for its subfolders throws ("folder is not open"),
            // which used to drop every sent copy on hosts without SPECIAL-USE.
            foreach (var folder in await imap.GetFoldersAsync(ns, false, ct))
            {
                if (folder.Attributes.HasFlag(FolderAttributes.Sent)) return folder;
                // Match the leaf name exactly. A plain "contains sent" also matched
                // folders like "Unsent Messages", filing the copy in the wrong place.
                var leaf = folder.FullName.Split(folder.DirectorySeparator).Last();
                if (string.Equals(leaf, "Sent", StringComparison.OrdinalIgnoreCase)) return folder;
            }
        }
        return null;
    }
}

/// <summary>A message accepted by the transport, with the MIME that went on the wire.</summary>
public sealed record SentMessage(string MessageId, MimeMessage Mime);

/// <summary>
/// Sends mail via SMTP. Builds the MIME message so that <c>Message-ID</c>, <c>Date</c>,
/// <c>In-Reply-To</c> and <c>References</c> are set correctly — the recipient's mail
/// client (or our own app) can then thread the reply on the same conversation.
///
/// Anything that fails before the transport transmits is a provably safe failure
/// (<see cref="SmtpNotSentException"/>); only the transport itself can produce
/// uncertainty. Sent filing happens separately through <see cref="FileSentCopyAsync"/>
/// after the caller durably records acceptance, and never fails the send.
/// </summary>
public class SmtpSender
{
    private readonly ISmtpTransport _transport;
    private readonly ISentCopyFiler _filer;
    private readonly AttachmentStore _attachments;
    private readonly ILogger<SmtpSender> _log;

    public SmtpSender(
        ISmtpTransport transport,
        ISentCopyFiler filer,
        AttachmentStore attachments,
        ILogger<SmtpSender> log)
    {
        _transport = transport;
        _filer = filer;
        _attachments = attachments;
        _log = log;
    }

    /// <summary>
    /// Sends a single composed message. <paramref name="references"/> should be the
    /// complete chain of message-ids for the thread (most-recent last); <paramref name="inReplyTo"/>
    /// should be the immediate parent's message-id. <paramref name="messageId"/> pins the
    /// wire Message-ID (idempotent sends); when null a fresh one is generated. Returns
    /// the message that was actually put on the wire, so callers can report its
    /// <c>Message-ID</c> back to the client and it matches the row the next sync ingests.
    /// </summary>
    public async Task<SentMessage> SendAsync(
        MailboxConnection connection,
        MailDraft draft,
        IReadOnlyList<string>? references,
        string? inReplyTo,
        CancellationToken ct,
        string? messageId = null)
        => await SendAsync(connection, draft, references, inReplyTo, Array.Empty<MailAttachment>(), ct, messageId);

    /// <inheritdoc cref="SendAsync(MailboxConnection, MailDraft, IReadOnlyList{string}, string, CancellationToken, string)"/>
    /// <param name="attachments">
    /// Staged attachments to include. Their bytes are streamed from the blob store into
    /// the MIME message, so a large file is never fully buffered as a byte[].
    /// </param>
    public async Task<SentMessage> SendAsync(
        MailboxConnection connection,
        MailDraft draft,
        IReadOnlyList<string>? references,
        string? inReplyTo,
        IReadOnlyList<MailAttachment> attachments,
        CancellationToken ct,
        string? messageId = null)
    {
        MimeMessage mime;
        List<Stream> openStreams;
        try
        {
            (mime, openStreams) = BuildMessage(connection, draft, references, inReplyTo, attachments, messageId);
        }
        catch (OperationCanceledException ex)
        {
            // Cancelled while building, before any transmission: safe to retry.
            throw new SmtpNotSentException("Send cancelled while building the message.", ex);
        }
        catch (SmtpNotSentException) { throw; }
        catch (Exception ex)
        {
            throw new SmtpNotSentException("Could not build the message: " + ex.Message, ex);
        }

        try
        {
            await _transport.SendAsync(connection, mime, ct);
            return new SentMessage(mime.MessageId, mime);
        }
        finally
        {
            foreach (var stream in openStreams) await stream.DisposeAsync();
        }
    }

    /// <summary>
    /// Files the sent copy after the caller durably records acceptance. Never throws.
    /// </summary>
    public async Task FileSentCopyAsync(MailboxConnection connection, MimeMessage mime, CancellationToken ct)
    {
        try
        {
            await _filer.FileAsync(connection, mime, ct);
        }
        catch (Exception ex)
        {
            _log.LogWarning(ex, "Sent-copy filing failed for {Mailbox} after acceptance.", connection.Email);
        }
    }

    /// <summary>
    /// Builds the MIME message and opens its attachment streams. Everything here
    /// runs before any transmission, so failures are provably safe to retry.
    /// </summary>
    private (MimeMessage Mime, List<Stream> Streams) BuildMessage(
        MailboxConnection connection,
        MailDraft draft,
        IReadOnlyList<string>? references,
        string? inReplyTo,
        IReadOnlyList<MailAttachment> attachments,
        string? messageId)
    {
        // Every staged attachment must still have its bytes before anything is sent: a
        // blob that vanished (swept, or a crash between upload and its row commit) used
        // to be skipped with `continue`, so the message went out missing a file the user
        // believed they had attached — silently, with a 200. Failing here is recoverable;
        // the recipient never knowing is not.
        foreach (var attachment in attachments)
        {
            if (!_attachments.Exists(attachment.BlobKey))
                throw new InvalidOperationException(
                    $"Attachment '{attachment.FileName}' is no longer available. Re-attach it and try again.");
        }

        var mime = new MimeMessage();

        // From: the authenticated mailbox address, with the mailbox owner's name as the
        // display name. This used to pass draft.ReplyToAddress — a *recipient* address —
        // as the display name, so outgoing mail was labelled
        // "someone@example.com <mailbox@host>".
        mime.From.Add(new MailboxAddress(connection.User?.DisplayName ?? string.Empty, connection.Email));

        AddRecipients(mime.To, draft.ToAddrs);
        AddRecipients(mime.Cc, draft.CcAddrs);
        AddRecipients(mime.Bcc, draft.BccAddrs);

        mime.Subject = draft.Subject ?? string.Empty;
        mime.Date = DateTimeOffset.UtcNow;

        // A pinned id keeps retries of one send operation on one Message-ID, so a
        // host-side duplicate stays findable and the Sent dedupe keeps working.
        // Otherwise a per-send id under the connection's email domain.
        var domain = connection.Email.Split('@', 2)[1];
        mime.MessageId = messageId ?? $"<{Guid.NewGuid():N}@{domain}>";

        if (!string.IsNullOrEmpty(inReplyTo)) mime.InReplyTo = inReplyTo;
        if (references is { Count: > 0 })
            foreach (var r in references) mime.References.Add(r);

        var body = string.IsNullOrEmpty(draft.BodyHtml)
            ? new TextPart("plain") { Text = draft.BodyText ?? string.Empty }
            : new TextPart("html") { Text = draft.BodyHtml };

        // Streams stay open until the message is written to the wire, so they are
        // returned for the caller to dispose after the send.
        var openStreams = new List<Stream>();
        if (attachments.Count == 0)
        {
            mime.Body = body;
        }
        else
        {
            var multipart = new Multipart("mixed") { body };
            foreach (var attachment in attachments)
            {
                // Existence was verified above; if this still returns null the store
                // changed under us and the exception is the correct outcome.
                var stream = _attachments.OpenRead(attachment.BlobKey) ?? throw new InvalidOperationException(
                    $"Attachment '{attachment.FileName}' disappeared while the message was being built.");
                openStreams.Add(stream);

                var contentType = ContentType.TryParse(attachment.ContentType, out var parsed)
                    ? parsed
                    : new ContentType("application", "octet-stream");

                multipart.Add(new MimePart(contentType)
                {
                    Content = new MimeContent(stream),
                    ContentDisposition = new ContentDisposition(ContentDisposition.Attachment),
                    ContentTransferEncoding = ContentEncoding.Base64,
                    FileName = attachment.FileName
                });
            }
            mime.Body = multipart;
        }

        return (mime, openStreams);
    }

    private static void AddRecipients(InternetAddressList target, string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw)) return;
        foreach (var part in raw.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
        {
            try { target.Add(MailboxAddress.Parse(part)); }
            catch (ParseException) { /* skip invalid; UI should prevent these but be defensive */ }
        }
    }
}
