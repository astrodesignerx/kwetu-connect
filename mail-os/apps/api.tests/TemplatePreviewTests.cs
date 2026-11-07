using System.Net;
using System.Net.Http.Json;
using Kompanion.Api.Data;
using Kompanion.Api.Services.Mail;
using Xunit;

namespace Kompanion.Api.Tests;

/// <summary>
/// Cover for the template gallery. The grid leads with a rendered preview of each
/// template, so a preview that still shows raw <c>{{placeholders}}</c>, or that is
/// missing the brand kit, is the difference between a gallery and a list of
/// half-drawn boxes.
/// </summary>
public class TemplatePreviewTests : IAsyncLifetime
{
    private TestAppFactory _factory = null!;

    public async ValueTask InitializeAsync()
    {
        _factory = new TestAppFactory();
        await _factory.InitializeAsync();
    }

    public async ValueTask DisposeAsync() => await _factory.DisposeAsync();

    private sealed record PreviewDto(
        Guid Id, string Name, string? Description, string[] Variables,
        string Subject, string BodyHtml, DateTimeOffset UpdatedAt);

    private static async Task<Guid> CreateTemplateAsync(
        HttpClient client, string name, string subject, string body, string[] variables,
        bool skipBrandWrap = false)
    {
        var res = await client.PostAsJsonAsync("/api/templates", new
        {
            name,
            description = (string?)null,
            subject,
            bodyHtml = body,
            variables,
            skipBrandWrap,
        });
        res.EnsureSuccessStatusCode();
        var created = await res.Content.ReadFromJsonAsync<Dictionary<string, object>>();
        return Guid.Parse(created!["id"].ToString()!);
    }

    [Fact]
    public async Task Previews_substitute_example_values_not_placeholder_names()
    {
        var admin = await ApiFixture.RegisterAdminAsync(_factory);
        await CreateTemplateAsync(admin.Client, "Proposal",
            "Proposal for {{project_name}}",
            "<p>Hi {{client_name}}, here is the quote for {{project_name}}.</p>",
            ["client_name", "project_name"]);

        var res = await admin.Client.GetAsync("/api/templates/previews");
        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        var previews = await res.Content.ReadFromJsonAsync<PreviewDto[]>();

        var preview = Assert.Single(previews!);

        // The whole point of the change: this used to render the variable's own name,
        // so a card read "Hi client_name" where the real send reads a person's name.
        Assert.Contains("Jane Wanjiru", preview.BodyHtml);
        Assert.DoesNotContain("client_name", preview.BodyHtml);
        Assert.DoesNotContain("{{", preview.BodyHtml);

        // Subjects go through the same substitution — the card shows the subject line.
        Assert.Contains("Riverdale", preview.Subject);
        Assert.DoesNotContain("{{", preview.Subject);
    }

    [Fact]
    public async Task Previews_are_wrapped_in_the_brand_kit_unless_the_template_opts_out()
    {
        var admin = await ApiFixture.RegisterAdminAsync(_factory);
        await CreateTemplateAsync(admin.Client, "Wrapped", "s", "<p>body</p>", []);
        await CreateTemplateAsync(admin.Client, "Raw", "s", "<p>body</p>", [], skipBrandWrap: true);

        var previews = await admin.Client.GetFromJsonAsync<PreviewDto[]>("/api/templates/previews");

        var wrapped = previews!.Single(p => p.Name == "Wrapped");
        var raw = previews!.Single(p => p.Name == "Raw");

        // Both come back as documents — a fragment cannot be displayed on its own —
        // but only one of them carries the kit's chrome.
        Assert.Contains("<!doctype html>", wrapped.BodyHtml, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("<!doctype html>", raw.BodyHtml, StringComparison.OrdinalIgnoreCase);

        Assert.Contains("max-width:640px", wrapped.BodyHtml);
        // Opting out means no letterhead, no sign-off and no page colour of its own:
        // the template paints every pixel itself.
        Assert.DoesNotContain("max-width:640px", raw.BodyHtml);
        Assert.DoesNotContain("background", raw.BodyHtml);
        Assert.Contains("<p>body</p>", raw.BodyHtml);
    }

    [Fact]
    public async Task Previews_are_scoped_to_the_callers_organization()
    {
        var mine = await ApiFixture.RegisterAdminAsync(_factory);
        await CreateTemplateAsync(mine.Client, "Mine", "s", "<p>mine</p>", []);

        // Registering a second admin would land in the same org, so the other org's
        // template is inserted directly — same approach as OrgScopingTests.
        await using (var db = _factory.NewDbContext())
        {
            var org = new Organization { Name = "Other Company" };
            db.Organizations.Add(org);
            await db.SaveChangesAsync();

            db.EmailTemplates.Add(new EmailTemplate
            {
                OrganizationId = org.Id,
                Name = "Theirs",
                Subject = "s",
                BodyHtml = "<p>theirs</p>",
            });
            await db.SaveChangesAsync();
        }

        var previews = await mine.Client.GetFromJsonAsync<PreviewDto[]>("/api/templates/previews");

        Assert.Equal("Mine", Assert.Single(previews!).Name);
    }

    [Fact]
    public async Task Previews_endpoint_is_not_swallowed_by_the_by_id_route()
    {
        var admin = await ApiFixture.RegisterAdminAsync(_factory);

        // "previews" is not a guid, so the {id:guid} constraint has to let it past.
        // Without the constraint this would be a 400 model-binding failure instead.
        var res = await admin.Client.GetAsync("/api/templates/previews");

        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
    }

    [Theory]
    // Specific matches must beat the general ones, or an address field comes back
    // as a person and an email field as a name.
    [InlineData("client_email", "jane.wanjiru@example.co.ke")]
    [InlineData("client_name", "Jane Wanjiru")]
    [InlineData("contactPhone", "+254 712 345 678")]
    [InlineData("total_amount", "KES 48,500")]
    [InlineData("project_name", "Riverdale Apartments launch")]
    public void Sample_values_prefer_the_more_specific_match(string variable, string expected)
    {
        Assert.Equal(expected, TemplateSampleValues.ValueFor(variable));
    }

    [Fact]
    public void Sample_values_fall_back_to_readable_words()
    {
        // No rule matches, so the placeholder should still read as content rather
        // than as an identifier.
        Assert.Equal("Widget count", TemplateSampleValues.ValueFor("widget_count"));
    }

    [Fact]
    public void Sample_values_tolerate_a_template_repeating_a_placeholder()
    {
        // The renderer takes a dictionary; a duplicated name would throw on insert.
        var values = TemplateSampleValues.For(["client_name", "client_name"]);

        Assert.Equal("Jane Wanjiru", values["client_name"]);
    }

    [Theory]
    // Metrics have to beat the general rules they sit inside: campaign_period would
    // otherwise be the campaign's name, and a rate would be a count.
    [InlineData("campaign_period", "1–31 July 2026")]
    [InlineData("impressions", "1,284,930")]
    [InlineData("conversion_rate", "2.98%")]
    [InlineData("conversions", "1,412")]
    [InlineData("meeting_time", "10:30 EAT")]
    public void Sample_values_cover_campaign_metrics(string variable, string expected)
    {
        Assert.Equal(expected, TemplateSampleValues.ValueFor(variable));
    }

    [Fact]
    public void Sample_values_do_not_mistake_corporate_for_a_rate()
    {
        // "corporate" contains "rate", which is why the rule matches "_rate" instead.
        Assert.Equal("Riverdale Developments", TemplateSampleValues.ValueFor("corporate_company"));
    }

    // ---------------- starter library ----------------

    public static TheoryData<string> StarterTemplateNames()
    {
        var data = new TheoryData<string>();
        foreach (var t in StarterTemplates.All) data.Add(t.Name);
        return data;
    }

    private static StarterTemplates.Definition Starter(string name) =>
        StarterTemplates.All.Single(t => t.Name == name);

    [Theory]
    [MemberData(nameof(StarterTemplateNames))]
    public void Starter_templates_declare_exactly_the_placeholders_they_use(string name)
    {
        var t = Starter(name);
        var used = System.Text.RegularExpressions.Regex
            .Matches($"{t.Subject} {t.BodyHtml}", @"\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}")
            .Select(m => m.Groups[1].Value)
            // "item" is the current entry inside a {{#each}} block, not a field of
            // its own — it is answered by the list, so it is never declared.
            .Where(v => v != TemplateRenderer.ItemVariable)
            .ToHashSet();

        // A placeholder missing from Variables never gets a value, so it renders as
        // literal "{{client_name}}" in a real send. One declared but unused is dead
        // weight that shows up as a chip on the gallery card.
        Assert.Equal(used.OrderBy(v => v), t.Variables.OrderBy(v => v));
    }

    [Theory]
    [MemberData(nameof(StarterTemplateNames))]
    public void Repeatable_blocks_are_balanced_and_use_the_item_placeholder(string name)
    {
        var t = Starter(name);
        var lists = TemplateRenderer.ListNames(t.BodyHtml);

        // An unclosed {{#each}} is invisible in a preview — the regex simply fails to
        // match and the whole block renders as literal text in a real send.
        var opens = System.Text.RegularExpressions.Regex.Matches(t.BodyHtml, @"\{\{#each\s").Count;
        var closes = System.Text.RegularExpressions.Regex.Matches(t.BodyHtml, @"\{\{/each\}\}").Count;
        Assert.Equal(opens, closes);
        Assert.Equal(opens, lists.Count);

        // A block that never uses {{item}} would repeat identical rows.
        foreach (var _ in lists)
            Assert.Contains("{{item}}", t.BodyHtml, StringComparison.Ordinal);
    }

    [Fact]
    public void Agenda_repeats_once_per_item_and_collapses_when_empty()
    {
        var t = Starter("Creative review invite");
        var renderer = new TemplateRenderer();
        var values = TemplateSampleValues.For(t.Variables);

        var four = renderer.RenderBody(t.BodyHtml, values, kit: null, wrap: false,
            new Dictionary<string, IReadOnlyList<string>>
            {
                ["agenda_items"] = ["One", "Two", "Three", "Four"],
            });

        // The row carries the amber dot; counting it counts the rendered items.
        var rows = System.Text.RegularExpressions.Regex.Matches(four, "background-color:#FBB040;margin-top:7px").Count;
        Assert.Equal(4, rows);
        Assert.Contains("Four", four, StringComparison.Ordinal);
        Assert.DoesNotContain("{{item}}", four, StringComparison.Ordinal);
        Assert.DoesNotContain("{{#each", four, StringComparison.Ordinal);

        // No list supplied: the block disappears rather than leaving the markup or a
        // stray placeholder behind.
        var none = renderer.RenderBody(t.BodyHtml, values, kit: null, wrap: false);
        Assert.DoesNotContain("{{#each", none, StringComparison.Ordinal);
        Assert.DoesNotContain("{{item}}", none, StringComparison.Ordinal);
    }

    [Fact]
    public void Item_text_is_escaped_so_a_list_cannot_inject_markup()
    {
        var t = Starter("Creative review invite");
        var html = new TemplateRenderer().RenderBody(
            t.BodyHtml, TemplateSampleValues.For(t.Variables), kit: null, wrap: false,
            new Dictionary<string, IReadOnlyList<string>>
            {
                ["agenda_items"] = ["<script>alert(1)</script>"],
            });

        Assert.DoesNotContain("<script>", html, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("&lt;script&gt;", html, StringComparison.Ordinal);
    }

    [Theory]
    [MemberData(nameof(StarterTemplateNames))]
    public void Starter_templates_are_fragments_not_documents(string name)
    {
        var t = Starter(name);

        // The composer drops the body into a contenteditable and sending wraps it in
        // the brand kit, so document-level markup would be mangled or duplicated.
        Assert.DoesNotContain("<!doctype", t.BodyHtml, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("<html", t.BodyHtml, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("<head", t.BodyHtml, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("<style", t.BodyHtml, StringComparison.OrdinalIgnoreCase);
        // Mail clients strip classes; every rule has to be inline to survive.
        Assert.DoesNotContain("class=", t.BodyHtml, StringComparison.OrdinalIgnoreCase);
    }

    [Theory]
    [MemberData(nameof(StarterTemplateNames))]
    public void Starter_templates_render_with_example_values_and_no_placeholders_left(string name)
    {
        var t = Starter(name);
        var renderer = new TemplateRenderer();
        var values = TemplateSampleValues.For(t.Variables);

        var body = renderer.RenderBody(t.BodyHtml, values, kit: null, wrap: false);
        var subject = renderer.RenderSubject(t.Subject, values);

        Assert.DoesNotContain("{{", body);
        Assert.DoesNotContain("{{", subject);
        Assert.NotEqual(t.BodyHtml, body);
    }

    [Fact]
    public void Starter_templates_have_distinct_names()
    {
        // Seeding matches on name, so two with the same name would fight each other.
        var names = StarterTemplates.All.Select(t => t.Name).ToList();
        Assert.Equal(names.Count, names.Distinct(StringComparer.OrdinalIgnoreCase).Count());
        Assert.Equal(7, names.Count);
    }

    [Fact]
    public void Only_the_self_branded_template_skips_the_brand_kit()
    {
        // The rest are written to sit inside the kit's chrome. One opting out by
        // accident would send with no letterhead at all.
        var skipping = StarterTemplates.All.Where(t => t.SkipBrandWrap).Select(t => t.Name);
        Assert.Equal(["Announcement"], skipping);
    }

    [Fact]
    public void The_self_branded_template_carries_its_own_letterhead_and_footer()
    {
        var t = StarterTemplates.All.Single(x => x.SkipBrandWrap);

        // It is sent without the kit, so anything the kit would have supplied has to
        // be in the template — otherwise it goes out with no sender and no sign-off.
        Assert.Contains("Kwetu Connect Ads", t.BodyHtml);
        Assert.Contains("Unsubscribe", t.BodyHtml);
        Assert.Contains("Nairobi", t.BodyHtml);
    }

    [Fact]
    public void A_skipped_wrap_still_produces_a_displayable_document()
    {
        // A stored template is a fragment, and a fragment cannot clear the default
        // body margin — a full-bleed design would render with a pale border down
        // every edge without this shell.
        var doc = TemplateRenderer.BareDocument("<p>hi</p>");

        Assert.StartsWith("<!doctype html>", doc);
        Assert.Contains("margin:0", doc);
        Assert.Contains("<p>hi</p>", doc);
        // No colours of its own: whatever the body paints has to reach the edges.
        Assert.DoesNotContain("background", doc);
    }

    // ---------------- brand kit chrome ----------------

    [Fact]
    public void Brand_kit_header_sits_inside_the_centred_column()
    {
        var renderer = new TemplateRenderer();
        var kit = new Kompanion.Api.Data.BrandKit
        {
            HeaderHtml = "<div id=\"letterhead\">Acme</div>",
            TextColor = "#171717",
            BackgroundColor = "#FFFFFF",
        };

        var html = renderer.RenderBody("<p>body</p>", new Dictionary<string, string?>(), kit, wrap: true);

        // The header used to be appended before the max-width column, which left it
        // flush against the left edge on any viewport wider than 640 while the body
        // centred underneath it.
        var column = html.IndexOf("max-width:640px", StringComparison.Ordinal);
        var header = html.IndexOf("id=\"letterhead\"", StringComparison.Ordinal);
        Assert.True(column >= 0 && header >= 0);
        Assert.True(header > column, "the header must be rendered inside the centred column, not before it");
    }

    [Fact]
    public void Generated_letterhead_carries_the_organisation_name_and_kit_colours()
    {
        var html = BrandKitDefaults.HeaderHtml("Kwetu Connect Ads", "#FBB040", "#171717");

        Assert.Contains("Kwetu Connect Ads", html);
        Assert.Contains("#FBB040", html);
        // The initial fills the tile.
        Assert.Contains(">K</td>", html);
        // An image would be blocked or stripped by most clients; this has to be markup.
        Assert.DoesNotContain("<img", html);
    }

    [Theory]
    [InlineData("", "Your company", "Y")]
    [InlineData("   ", "Your company", "Y")]
    [InlineData("acme ltd", "acme ltd", "A")]
    public void Generated_letterhead_handles_awkward_organisation_names(
        string orgName, string expectedName, string expectedInitial)
    {
        // Called on every new org, so an empty name must not throw on name[0].
        var html = BrandKitDefaults.HeaderHtml(orgName, null, null);

        Assert.Contains(expectedName, html);
        Assert.Contains($">{expectedInitial}</td>", html);
    }

    [Fact]
    public void Generated_letterhead_escapes_the_organisation_name()
    {
        var html = BrandKitDefaults.HeaderHtml("Ben & Co <script>", "#FBB040", "#171717");

        Assert.DoesNotContain("<script>", html);
        Assert.Contains("&amp;", html);
    }

    [Theory]
    [MemberData(nameof(StarterTemplateNames))]
    public void Starter_templates_have_a_gradient_backed_by_a_solid_colour(string name)
    {
        var t = Starter(name);

        // Desktop Outlook drops gradients. Every element carrying one needs a
        // background-color underneath it or the design collapses to unstyled text.
        var gradients = System.Text.RegularExpressions.Regex.Matches(t.BodyHtml, "background-image:[^;\"]*gradient");
        Assert.NotEmpty(gradients);
        foreach (System.Text.RegularExpressions.Match g in gradients)
        {
            var declaration = t.BodyHtml[..g.Index];
            var styleStart = declaration.LastIndexOf("style=\"", StringComparison.Ordinal);
            Assert.Contains("background-color:", t.BodyHtml[styleStart..g.Index]);
        }
    }
}
