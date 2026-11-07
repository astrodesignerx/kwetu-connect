using System.Globalization;

namespace Kompanion.Api.Services.Mail;

/// <summary>
/// Stand-in values for previewing a template.
///
/// A preview used to substitute each placeholder with its own name, so a card or a
/// preview pane read "client_name" where the real send reads "Jane Wanjiru". That
/// makes it hard to judge the thing you are actually looking at — line lengths,
/// wrapping and tone all change once real content is in place — so previews use
/// plausible example content instead.
///
/// Deliberately local to how the agency actually writes: Kenyan names, KES amounts,
/// +254 numbers. A preview full of "John Doe" and "$100" is a preview of someone
/// else's product.
/// </summary>
public static class TemplateSampleValues
{
    /// <summary>
    /// Builds the substitution map a renderer expects. Matching is on substrings of
    /// the placeholder name, so <c>client</c> covers <c>client_name</c>,
    /// <c>clientName</c> and <c>primary_client</c> alike.
    /// </summary>
    public static IReadOnlyDictionary<string, string?> For(IEnumerable<string>? variables)
    {
        var map = new Dictionary<string, string?>(StringComparer.Ordinal);
        foreach (var name in variables ?? Enumerable.Empty<string>())
        {
            if (string.IsNullOrWhiteSpace(name)) continue;
            // Templates can repeat a placeholder; the map only needs it once.
            map[name] = ValueFor(name);
        }
        return map;
    }

    /// <summary>
    /// Stand-in items for a repeatable block, so a gallery card shows a filled list
    /// rather than the gap an empty one leaves.
    ///
    /// Three of them: enough to show the rhythm of a list, few enough that the card
    /// still shows what comes after it.
    /// </summary>
    public static IReadOnlyDictionary<string, IReadOnlyList<string>> ListsFor(IEnumerable<string>? listNames)
    {
        var map = new Dictionary<string, IReadOnlyList<string>>(StringComparer.Ordinal);
        foreach (var name in listNames ?? Enumerable.Empty<string>())
        {
            if (string.IsNullOrWhiteSpace(name)) continue;
            map[name] = ItemsFor(name);
        }
        return map;
    }

    private static IReadOnlyList<string> ItemsFor(string name)
    {
        var n = name.ToLowerInvariant();

        if (Has(n, "agenda"))
            return
            [
                "Where the idea landed, and why",
                "Two routes, side by side, with the trade-offs",
                "What we need from you to keep the schedule",
            ];
        if (Has(n, "deliverable", "scope", "included"))
            return ["Concept and art direction", "Three placements, adapted", "One round of revisions"];
        if (Has(n, "step", "next"))
            return ["We share the files by Friday", "You confirm the final route", "We book the placements"];

        return ["First item", "Second item", "Third item"];
    }

    public static string ValueFor(string name)
    {
        if (KcaConceptTemplates.TryPreviewValue(name, out var example)) return example;
        var n = name.ToLowerInvariant();

        // Order matters: the more specific tests have to run before the general
        // ones, or "client_email" would come back as a person's name.
        if (Has(n, "email")) return "jane.wanjiru@example.co.ke";
        if (Has(n, "phone", "mobile", "tel")) return "+254 712 345 678";
        if (Has(n, "url", "link", "website")) return "https://kwetuconnectads.co.ke";
        if (Has(n, "amount", "total", "price", "cost", "budget", "quote")) return "KES 48,500";
        if (Has(n, "invoice", "reference", "ref_", "number")) return "KCA-2043";

        // Campaign metrics. These have to beat "campaign" below, or a variable named
        // campaign_period comes back as the campaign's name. Rates are tested before
        // counts so conversion_rate reads as a percentage rather than a number.
        // "_rate" rather than a bare "rate": "corporate" ends in one, and "rate_"
        // does not help either — "corporate_company" contains that too.
        if (Has(n, "ctr", "_rate")) return "2.98%";
        if (Has(n, "impression")) return "1,284,930";
        if (Has(n, "click")) return "38,240";
        if (Has(n, "conversion", "lead")) return "1,412";
        if (Has(n, "reach")) return "612,400";
        if (Has(n, "spend")) return "KES 240,000";
        if (Has(n, "period", "flight")) return "1–31 July 2026";

        if (Has(n, "deadline", "due")) return Days(7);
        if (Has(n, "time")) return "10:30 EAT";
        if (Has(n, "date", "day")) return Days(0);
        if (Has(n, "sender", "agent", "account_manager", "rep")) return "Amina Otieno";
        if (Has(n, "company", "business", "organisation", "organization")) return "Riverdale Developments";
        if (Has(n, "project", "campaign")) return "Riverdale Apartments launch";
        if (Has(n, "client", "customer", "recipient", "contact", "name")) return "Jane Wanjiru";
        if (Has(n, "title", "role", "position")) return "Marketing Lead";
        if (Has(n, "address", "location")) return "Kilimani, Nairobi";

        // Nothing matched: show the placeholder as readable words rather than a
        // raw identifier, so the layout is still judged on something sentence-like.
        return Humanise(name);
    }

    private static bool Has(string haystack, params string[] needles) =>
        needles.Any(needle => haystack.Contains(needle, StringComparison.Ordinal));

    private static string Days(int offset) =>
        DateTime.UtcNow.AddDays(offset).ToString("d MMM yyyy", CultureInfo.InvariantCulture);

    private static string Humanise(string name)
    {
        var words = name.Replace('_', ' ').Replace('-', ' ').Trim();
        return words.Length == 0 ? name : char.ToUpperInvariant(words[0]) + words[1..];
    }
}
