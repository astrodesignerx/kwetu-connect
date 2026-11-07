using System.Net;

namespace Kompanion.Api.Services.Mail;

/// <summary>
/// The chrome a brand kit starts with.
///
/// It is generated rather than hardcoded so it carries the organisation's own name
/// and the kit's own colours. What is stored is a snapshot of HTML — the kit has no
/// way to reference its colours later — so changing a colour means regenerating the
/// header, which is what the <c>refresh-brand-kit</c> command is for.
/// </summary>
public static class BrandKitDefaults
{
    /// <summary>
    /// A letterhead lockup: a rounded tile carrying the organisation's initial, and
    /// the name beside it.
    ///
    /// Drawn with a table cell and a letter rather than an image on purpose. Mail
    /// clients block remote images by default and strip SVG, so a logo file would
    /// leave a broken box at the top of every email for most recipients; this always
    /// renders. It is quiet by design — the templates below it carry the loud part,
    /// and this has to sit above a hand-typed reply just as comfortably.
    /// </summary>
    public static string HeaderHtml(string organisationName, string? primaryColor, string? textColor)
    {
        var name = string.IsNullOrWhiteSpace(organisationName) ? "Your company" : organisationName.Trim();
        var initial = char.ToUpperInvariant(name[0]).ToString();
        var tile = primaryColor ?? "#FBB040";
        var ink = textColor ?? "#171717";

        return
            "<table role=\"presentation\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\" style=\"border-collapse:collapse;margin:0 0 20px;\">" +
            "<tr>" +
            // Width and height are set as attributes as well as styles: the Word engine
            // behind desktop Outlook honours the attributes and ignores the rest.
            $"<td width=\"32\" height=\"32\" align=\"center\" valign=\"middle\" style=\"width:32px;height:32px;background-color:{tile};border-radius:9px;font-size:16px;font-weight:800;font-style:italic;line-height:32px;color:{ink};\">{WebUtility.HtmlEncode(initial)}</td>" +
            $"<td style=\"padding-left:11px;font-size:12px;font-weight:700;letter-spacing:1.8px;text-transform:uppercase;color:{ink};\">{WebUtility.HtmlEncode(name)}</td>" +
            "</tr></table>";
    }
}
