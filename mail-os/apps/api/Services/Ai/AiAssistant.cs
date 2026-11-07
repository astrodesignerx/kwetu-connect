using System.Text;
using Kompanion.Api.Data;
using Microsoft.EntityFrameworkCore;

namespace Kompanion.Api.Services.Ai;

public class AiAssistant
{
    private readonly AppDbContext _db;
    private readonly LlmClient _llm;

    public AiAssistant(AppDbContext db, LlmClient llm)
    {
        _db = db;
        _llm = llm;
    }

    /// <summary>Summarize a thread for the user reading it.</summary>
    public async Task<SummaryResult> SummarizeThreadAsync(Guid threadId, Guid userId, CancellationToken ct)
    {
        var thread = await LoadOwnedThreadAsync(threadId, userId, ct);
        if (thread is null) throw new KeyNotFoundException("Thread not found.");

        var messages = await LoadMessagesAsync(thread, ct);
        if (messages.Count == 0) return new SummaryResult("(thread is empty)", 0, _llm.Options.Model);

        var trimmed = TrimToContext(messages);
        var prompt = BuildMessages(trimmed);

        var system = "You are an email assistant. Produce a concise, neutral summary of the email " +
                     "thread in 3–6 bullet points. Focus on: who is asking, what they need, " +
                     "what was decided or proposed, and any open questions or next steps. " +
                     "Do not add commentary or sign off. Plain text only.";
        var content = await _llm.ChatAsync(
            new List<ChatMessage>
            {
                new("system", system),
                new("user", prompt),
            },
            options: new Dictionary<string, object> { ["temperature"] = 0.2, ["maxTokens"] = 600 },
            ct: ct);

        return new SummaryResult(content.Trim(), messages.Count, _llm.Options.Model);
    }

    /// <summary>Draft a reply to the latest message in the thread.</summary>
    public async Task<string> SuggestReplyAsync(Guid threadId, Guid userId, string? tone, CancellationToken ct)
    {
        var thread = await LoadOwnedThreadAsync(threadId, userId, ct);
        if (thread is null) throw new KeyNotFoundException("Thread not found.");

        var messages = await LoadMessagesAsync(thread, ct);
        if (messages.Count == 0) throw new InvalidOperationException("Thread has no messages to reply to.");

        var trimmed = TrimToContext(messages, lastN: 6);
        var prompt = BuildMessages(trimmed);
        var system = ToneSystemPrompt(tone) + " " +
                     "Draft the next reply from the user (Kwetu Connect Ads) based on the thread. " +
                     "Be concise and concrete. Sign off appropriately. Plain text body only — no subject, " +
                     "no <html>, no leading 'Subject:' line.";

        var content = await _llm.ChatAsync(
            new List<ChatMessage>
            {
                new("system", system),
                new("user", prompt),
            },
            options: new Dictionary<string, object> { ["temperature"] = 0.5, ["maxTokens"] = 600 },
            ct: ct);

        return content.Trim();
    }

    /// <summary>Rewrite a user-supplied body in a target tone.</summary>
    public async Task<string> RewriteAsync(string body, string? tone, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(body))
            throw new InvalidOperationException("Body is empty.");
        var system = ToneSystemPrompt(tone) + " " +
                     "Rewrite the email body in the tone above. Preserve the meaning, facts, names, " +
                     "and any quoted content. Plain text only — no <html> tags. Output only the rewritten body.";
        var content = await _llm.ChatAsync(
            new List<ChatMessage>
            {
                new("system", system),
                new("user", body),
            },
            options: new Dictionary<string, object> { ["temperature"] = 0.3, ["maxTokens"] = 800 },
            ct: ct);
        return content.Trim();
    }

    private async Task<MailThread?> LoadOwnedThreadAsync(Guid threadId, Guid userId, CancellationToken ct)
    {
        var orgId = await _db.Users
            .Where(u => u.Id == userId)
            .Select(u => u.OrganizationId)
            .FirstAsync(ct);
        return await _db.MailThreads
            .Include(t => t.MailboxConnection)
            .FirstOrDefaultAsync(
                t => t.Id == threadId && t.MailboxConnection!.User!.OrganizationId == orgId,
                ct);
    }

    private async Task<List<MailMessage>> LoadMessagesAsync(MailThread thread, CancellationToken ct) =>
        await _db.MailMessages
            .Where(m => m.ThreadId == thread.Id)
            .OrderBy(m => m.MessageDate ?? m.InternalDate)
            .ToListAsync(ct);

    /// <summary>
    /// Truncates the thread to a workable context window: at most <paramref name="lastN"/>
    /// messages, each body clipped to 4000 chars. Keeps the assistant focused on the
    /// recent back-and-forth and protects against unbounded prompts.
    /// </summary>
    private static List<MailMessage> TrimToContext(List<MailMessage> messages, int lastN = 20)
    {
        const int maxBodyChars = 4000;
        var tail = messages.TakeLast(lastN).ToList();
        foreach (var m in tail)
        {
            if (!string.IsNullOrEmpty(m.BodyText) && m.BodyText.Length > maxBodyChars)
                m.BodyText = m.BodyText.Substring(0, maxBodyChars) + "…";
            if (!string.IsNullOrEmpty(m.BodyHtml) && m.BodyHtml.Length > maxBodyChars)
                m.BodyHtml = m.BodyHtml.Substring(0, maxBodyChars) + "…";
        }
        return tail;
    }

    private static string BuildMessages(IEnumerable<MailMessage> messages)
    {
        var sb = new StringBuilder();
        sb.AppendLine("Below is an email thread. Each message is prefixed with the sender, recipients, and date.");
        sb.AppendLine();
        foreach (var m in messages)
        {
            var who = string.IsNullOrEmpty(m.FromName) ? m.FromAddr ?? "?" : $"{m.FromName} <{m.FromAddr}>";
            var when = (m.MessageDate ?? m.InternalDate)?.ToString("yyyy-MM-dd HH:mm") ?? "?";
            var to = m.ToAddrs ?? "";
            var body = !string.IsNullOrWhiteSpace(m.BodyText)
                ? m.BodyText
                : (m.BodyHtml ?? "").Replace("<br>", "\n").Replace("</p>", "\n\n");
            sb.AppendLine($"--- {who} → {to}  ({when}) ---");
            sb.AppendLine($"Subject: {m.Subject ?? "(no subject)"}");
            sb.AppendLine();
            sb.AppendLine(body?.Trim() ?? "");
            sb.AppendLine();
        }
        return sb.ToString();
    }

    private static string ToneSystemPrompt(string? tone) => tone?.Trim().ToLowerInvariant() switch
    {
        "friendly" => "You write in a warm, friendly, conversational tone appropriate for a long-standing client.",
        "concise" => "You write in a very concise, direct tone. Short sentences. Bullet points when listing.",
        "professional" => "You write in a polished, professional tone appropriate for client-facing communication.",
        _ => "You write in a polished, professional tone appropriate for client-facing communication."
    };
}

public sealed record SummaryResult(string Summary, int MessageCount, string Model);
