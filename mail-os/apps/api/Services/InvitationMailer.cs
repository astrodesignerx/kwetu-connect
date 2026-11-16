using System.Net;
using Kompanion.Api.Data;
using Kompanion.Api.Services.Mail;
using MimeKit;
using MimeKit.Utils;

namespace Kompanion.Api.Services;

public sealed class InvitationMailer(ISmtpTransport transport, SmtpSender sender, IConfiguration config)
{
    public async Task<(bool Sent, string? Error)> SendAsync(Invitation invitation, string token,
        string invitedBy, MailboxConnection? from, IReadOnlyList<string> mailboxes, CancellationToken ct)
    {
        if (from is null) return (false, "No sending mailbox was selected.");
        var baseUrl = config["App:WebBaseUrl"];
        if (string.IsNullOrWhiteSpace(baseUrl)) baseUrl = config.GetSection("Cors:WebOrigins").Get<string[]>()?.FirstOrDefault();
        if (!Uri.TryCreate(baseUrl, UriKind.Absolute, out var uri) || uri.Scheme is not ("https" or "http"))
            return (false, "The web address is not configured.");
        if (!from.IsActive) return (false, "The sending mailbox is disconnected.");

        try
        {
            var link = baseUrl!.TrimEnd('/') + "/register?invite=" + Uri.EscapeDataString(token);
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
