using System.Net;
using System.Text.RegularExpressions;
using Kompanion.Api.Data;

namespace Kompanion.Api.Services.Mail;

/// <summary>
/// Renders a template (or ad-hoc body) into a finished HTML email by:
///   1. substituting <c>{{variable}}</c> placeholders with HTML-escaped values, and
///   2. wrapping the body in the brand kit's header / footer / signature unless the
///      template opts out via <c>SkipBrandWrap</c>.
/// Variable substitution is HTML-encoded to keep the template language simple while
/// preventing user-supplied variable values from breaking the surrounding HTML.
/// </summary>
public class TemplateRenderer
{
    private static readonly Regex VariablePattern =
        new(@"\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}", RegexOptions.Compiled);

    /// <summary>
    /// A repeatable block: <c>{{#each agenda_items}}…{{item}}…{{/each}}</c>.
    ///
    /// Designed email is table markup, so a list of three bullets was three
    /// hand-written table rows whose spacing depended on which one came last. That
    /// made "add a fourth agenda item" a markup-editing job, which is not something
    /// a rich-text editor can offer — its list button emits &lt;ul&gt;, which mail
    /// clients draw with their own bullet.
    ///
    /// Declaring the row once and repeating it moves the question from "can you
    /// write this HTML" to "how many items do you have".
    /// </summary>
    private static readonly Regex EachPattern =
        new(@"\{\{#each\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}([\s\S]*?)\{\{/each\}\}", RegexOptions.Compiled);

    /// <summary>The current item inside a repeated block.</summary>
    private static readonly Regex ItemPattern =
        new(@"\{\{\s*item\s*\}\}", RegexOptions.Compiled);

    /// <summary>Reserved: it means "the current item", never a field of its own.</summary>
    public const string ItemVariable = "item";

    public RenderedTemplate Render(
        EmailTemplate template,
        IReadOnlyDictionary<string, string?> values,
        BrandKit? kit,
        IReadOnlyDictionary<string, IReadOnlyList<string>>? lists = null)
    {
        var subject = VariablePattern.Replace(template.Subject ?? string.Empty,
            m => Escape(values, m.Groups[1].Value));

        // Lists first: expanding a block copies the row markup, and the copies still
        // contain ordinary {{placeholders}} that the pass below has to see.
        var body = ExpandLists(template.BodyHtml ?? string.Empty, lists);
        body = VariablePattern.Replace(body, m => Escape(values, m.Groups[1].Value));

        if (kit is not null && !template.SkipBrandWrap)
            body = WrapInKit(kit, body);

        return new RenderedTemplate(subject, body);
    }

    public string RenderBody(
        string? bodyHtml,
        IReadOnlyDictionary<string, string?> values,
        BrandKit? kit,
        bool wrap,
        IReadOnlyDictionary<string, IReadOnlyList<string>>? lists = null)
    {
        var body = ExpandLists(bodyHtml ?? string.Empty, lists);
        body = VariablePattern.Replace(body, m => Escape(values, m.Groups[1].Value));
        if (wrap && kit is not null) body = WrapInKit(kit, body);
        return body;
    }

    /// <summary>
    /// The list names a body declares, in the order they appear.
    /// </summary>
    public static IReadOnlyList<string> ListNames(string? bodyHtml)
    {
        if (string.IsNullOrEmpty(bodyHtml)) return [];
        var names = new List<string>();
        foreach (Match m in EachPattern.Matches(bodyHtml))
        {
            var name = m.Groups[1].Value;
            if (!names.Contains(name, StringComparer.Ordinal)) names.Add(name);
        }
        return names;
    }

    /// <summary>
    /// Repeats each block once per item, dropping it entirely when the list is empty
    /// — an unfilled agenda should leave no heading dangling over nothing.
    /// </summary>
    private static string ExpandLists(string body, IReadOnlyDictionary<string, IReadOnlyList<string>>? lists)
    {
        if (body.Length == 0 || !body.Contains("{{#each", StringComparison.Ordinal)) return body;

        return EachPattern.Replace(body, m =>
        {
            var name = m.Groups[1].Value;
            var row = m.Groups[2].Value;

            if (lists is null || !lists.TryGetValue(name, out var items) || items is null)
                return string.Empty;

            var sb = new System.Text.StringBuilder();
            foreach (var item in items)
            {
                if (string.IsNullOrWhiteSpace(item)) continue;
                // MatchEvaluator rather than a replacement string: item text is the
                // user's, and "$1" in a replacement string is a backreference.
                var encoded = WebUtility.HtmlEncode(item);
                sb.Append(ItemPattern.Replace(row, _ => encoded));
            }
            return sb.ToString();
        });
    }

    public string RenderSubject(string? subjectTemplate, IReadOnlyDictionary<string, string?> values)
        => VariablePattern.Replace(subjectTemplate ?? string.Empty,
            m => Escape(values, m.Groups[1].Value));

    private static string Escape(IReadOnlyDictionary<string, string?> values, string key)
    {
        var raw = values.TryGetValue(key, out var v) ? v : null;
        var safe = raw ?? $"{{{{{key}}}}}";
        return WebUtility.HtmlEncode(safe);
    }

    /// <summary>
    /// The minimum document a body needs to be displayed on its own, for templates
    /// that bring their own branding and so skip the kit.
    ///
    /// Templates are stored as fragments — the composer drops them into an editor,
    /// which would mangle a head — but a fragment has no way to clear the default
    /// body margin, so a full-bleed design would render with a pale border down
    /// every edge. This supplies that, and the same font stack the kit wrap sets,
    /// since a document with no font-family falls back to the client's serif. No
    /// colours: whatever the body paints has to reach the edges.
    /// </summary>
    public static string BareDocument(string body) =>
        "<!doctype html><html><head><meta charset=\"utf-8\">" +
        "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">" +
        "<style>body{margin:0;padding:0;" +
        "font-family:-apple-system,BlinkMacSystemFont,'SF Pro Text',Inter,Segoe UI,sans-serif;" +
        "line-height:1.5;}</style>" +
        "</head><body>" + body + "</body></html>";

    private static string WrapInKit(BrandKit kit, string body)
    {
        var bg = kit.BackgroundColor ?? "#FEFBD2";
        var text = kit.TextColor ?? "#171717";
        var accent = kit.AccentColor ?? "#FBB040";
        var sb = new System.Text.StringBuilder();
        sb.Append("<!doctype html><html><head><meta charset=\"utf-8\">");
        sb.Append("<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">");
        sb.Append($"<style>body{{margin:0;padding:24px;background:{bg};color:{text};font-family:-apple-system,BlinkMacSystemFont,'SF Pro Text',Inter,Segoe UI,sans-serif;line-height:1.5;}}a{{color:{accent};text-decoration:none;font-weight:600;}}</style>");
        sb.Append("</head><body>");
        // Inside the centred column, not before it. Outside, the letterhead stayed
        // flush left on any viewport wider than 640 while the body centred underneath
        // it, so the sender's own name looked like it belonged to a different email.
        sb.Append("<div style=\"max-width:640px;margin:0 auto;\">");

        sb.Append(body);

        // The letterhead sits at the *foot*, with the signature, rather than above
        // the body.
        //
        // Every designed template opens with its own hero — a dark banner carrying
        // the headline — and a second lockup stacked above that read as two
        // competing mastheads for one message. It was also the wrong weight on a
        // two-line reply, where a full letterhead introduced a sentence.
        //
        // Below the rule it does the job a printed letterhead does at the bottom of
        // a compliments slip: it says who sent this, next to the sign-off, without
        // announcing itself first. The announcement template is unaffected either
        // way — it sets SkipBrandWrap and carries its own wordmark.
        var hasHeader = !string.IsNullOrWhiteSpace(kit.HeaderHtml);
        var hasSignature = !string.IsNullOrWhiteSpace(kit.SignatureHtml);
        if (hasHeader || hasSignature)
            sb.Append("<hr style=\"border:0;border-top:1px solid " + text + "22;margin:24px 0;\">");
        if (hasHeader) sb.Append(kit.HeaderHtml);
        if (hasSignature) sb.Append(kit.SignatureHtml);

        if (!string.IsNullOrWhiteSpace(kit.FooterHtml)) sb.Append(kit.FooterHtml);
        sb.Append("</div></body></html>");
        return sb.ToString();
    }
}

public sealed record RenderedTemplate(string Subject, string BodyHtml);
