using System.Net;
using Kompanion.Api.Data;
using Kompanion.Api.Services.Mail;
using MimeKit;
using MimeKit.Utils;

namespace Kompanion.Api.Services;

public sealed class InvitationMailer(ISmtpTransport transport, SmtpSender sender, IConfiguration config)
{
    /// <summary>
    /// The address people open Kwetu OS at: App:WebBaseUrl, else the first allowed web origin.
    /// Cors:WebOrigins arrives as a comma-separated string from environment variables and as a
    /// list from JSON, so both forms are read. Null when neither is an absolute http(s) address.
    /// </summary>
    public static string? WebAddress(IConfiguration config)
    {
        var baseUrl = config["App:WebBaseUrl"];
        if (string.IsNullOrWhiteSpace(baseUrl))
            baseUrl = config["Cors:WebOrigins"]?.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries).FirstOrDefault()
                ?? config.GetSection("Cors:WebOrigins").Get<string[]>()?.FirstOrDefault();
        return Uri.TryCreate(baseUrl, UriKind.Absolute, out var uri) && uri.Scheme is "https" or "http"
            ? baseUrl!.TrimEnd('/') : null;
    }

    public async Task<(bool Sent, string? Error)> SendAsync(Invitation invitation, string token,
        string invitedBy, MailboxConnection? from, IReadOnlyList<string> mailboxes, CancellationToken ct)
    {
        if (from is null) return (false, "No sending mailbox was selected.");
        var baseUrl = WebAddress(config);
        if (baseUrl is null) return (false, "The web address is not configured.");
        if (!from.IsActive) return (false, "The sending mailbox is disconnected.");

        try
        {
            var link = baseUrl + "/register?invite=" + Uri.EscapeDataString(token);
            var access = invitation.Role == UserRole.Admin ? "As an admin, you will see every mailbox."
                : mailboxes.Count == 0 ? "You will see no mail until an admin shares a mailbox with you."
                : "You will see: " + string.Join(", ", mailboxes) + ".";
            var introduction = invitedBy + " invited you to Kwetu OS.";
            using var message = new MimeMessage();
            message.From.Add(new MailboxAddress(from.User.DisplayName, from.Email));
            message.To.Add(MailboxAddress.Parse(invitation.Email));
            message.Subject = "Your invitation to Kwetu OS";
            message.Date = DateTimeOffset.UtcNow;
            message.MessageId = MimeUtils.GenerateMessageId(from.Email.Split('@')[1]);
            message.Body = new BodyBuilder
            {
                TextBody = introduction + "\n\n" + access + "\n\n" + link + "\n\nThis link works for 7 days.",
                HtmlBody = "<p>" + WebUtility.HtmlEncode(introduction) + "</p><p>" + WebUtility.HtmlEncode(access)
                    + "</p><p><a href=\"" + WebUtility.HtmlEncode(link)
                    + "\">Join Kwetu OS</a></p><p>This link works for 7 days.</p>"
            }.ToMessageBody();
            await transport.SendAsync(from, message, ct);
            await sender.FileSentCopyAsync(from, message, ct);
            return (true, null);
        }
        catch (Exception)
        {
            // Keep transport details and the invitation link out of logs and responses.
            return (false, "The invitation email could not be sent.");
        }
    }
}
