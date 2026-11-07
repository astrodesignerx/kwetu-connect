using System.Security.Claims;
using System.Text.Json;
using Kompanion.Api.Auth;
using Kompanion.Api.Data;
using Kompanion.Api.Models;
using Kompanion.Api.Services;
using Kompanion.Api.Services.Mail;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Kompanion.Api.Controllers;

[ApiController]
[Authorize]
[Route("api")]
public class TemplatesController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly TemplateRenderer _renderer;
    private readonly AuditService _audit;

    public TemplatesController(AppDbContext db, TemplateRenderer renderer, AuditService audit)
    {
        _db = db;
        _renderer = renderer;
        _audit = audit;
    }

    private Guid UserId() => this.CallerId();

    private string ActorEmail() => User.FindFirstValue(ClaimTypes.Email) ?? "";

    // Read from the signed token rather than re-querying the user on every request.
    private int OrgId() => this.CallerOrgId();

    private async Task<BrandKit?> GetOrCreateKitAsync(int orgId, CancellationToken ct)
    {
        var kit = await _db.BrandKits.FirstOrDefaultAsync(k => k.OrganizationId == orgId, ct);
        if (kit is null)
        {
            var orgName = await _db.Organizations
                .Where(o => o.Id == orgId).Select(o => o.Name).FirstOrDefaultAsync(ct) ?? "Your company";

            kit = new BrandKit
            {
                OrganizationId = orgId,
                Name = "Default",
                PrimaryColor = "#FBB040",
                AccentColor = "#F9ED32",
                TextColor = "#171717",
                BackgroundColor = "#FEFBD2",
                // A new org's mail should look addressed from someone from the first
                // send, rather than starting with no letterhead at all.
                HeaderHtml = BrandKitDefaults.HeaderHtml(orgName, "#FBB040", "#171717")
            };
            _db.BrandKits.Add(kit);
            await _db.SaveChangesAsync(ct);
        }
        return kit;
    }

    // ---------- Brand kit ----------

    [HttpGet("brand-kit")]
    public async Task<IActionResult> GetBrandKit(CancellationToken ct)
    {
        var orgId = OrgId();
        var kit = await GetOrCreateKitAsync(orgId, ct);
        return Ok(ToDto(kit));
    }

    [HttpPut("brand-kit")]
    public async Task<IActionResult> UpdateBrandKit(BrandKitUpsertRequest body, CancellationToken ct)
    {
        var orgId = OrgId();
        var kit = await GetOrCreateKitAsync(orgId, ct);
        kit.Name = body.Name;
        kit.PrimaryColor = body.PrimaryColor;
        kit.AccentColor = body.AccentColor;
        kit.TextColor = body.TextColor;
        kit.BackgroundColor = body.BackgroundColor;
        kit.LogoUrl = body.LogoUrl;
        kit.HeaderHtml = body.HeaderHtml;
        kit.FooterHtml = body.FooterHtml;
        kit.SignatureHtml = body.SignatureHtml;
        kit.UpdatedAt = DateTimeOffset.UtcNow;
        await _db.SaveChangesAsync(ct);
        await _audit.LogAsync(UserId(), ActorEmail(), "brandkit.update",
            details: $"Brand kit {kit.Id}");
        return Ok(ToDto(kit));
    }

    // ---------- Templates ----------

    [HttpGet("templates")]
    public async Task<IActionResult> ListTemplates(CancellationToken ct)
    {
        var orgId = OrgId();
        var templates = await _db.EmailTemplates
            .Where(t => t.OrganizationId == orgId)
            .OrderBy(t => t.Name)
            .ToListAsync(ct);
        return Ok(templates.Select(ToSummary));
    }

    /// <summary>
    /// Every template rendered with example values, for the template gallery.
    ///
    /// One call rather than a preview request per card: the brand kit is the same for
    /// all of them, so rendering them together fetches it once instead of once per
    /// template. Safe beside <c>templates/{id:guid}</c> — "previews" is not a guid, so
    /// the constraint keeps the two routes apart.
    /// </summary>
    [HttpGet("templates/previews")]
    public async Task<IActionResult> ListTemplatePreviews(CancellationToken ct)
    {
        var orgId = OrgId();
        var kit = await GetOrCreateKitAsync(orgId, ct);
        var templates = await _db.EmailTemplates
            .Where(t => t.OrganizationId == orgId)
            .OrderBy(t => t.Name)
            .ToListAsync(ct);

        return Ok(templates.Select(t =>
        {
            var variables = ParseVariables(t);
            // Lists are read from the body rather than stored beside it: the
            // {{#each}} block *is* the declaration, so the two cannot fall out of
            // step the way a separate column would.
            var lists = TemplateRenderer.ListNames(t.BodyHtml);
            var values = TemplateSampleValues.For(variables);
            var sampleLists = TemplateSampleValues.ListsFor(lists);
            var body = _renderer.RenderBody(t.BodyHtml, values, kit, wrap: !t.SkipBrandWrap, sampleLists);
            // A self-branded template is stored as a fragment, which has no way to
            // clear the default body margin — previewing it raw would show a pale
            // border around a design meant to reach the edges. Same shell the send
            // path gives it, so the card shows what the recipient gets.
            if (t.SkipBrandWrap) body = TemplateRenderer.BareDocument(body);

            return new EmailTemplatePreviewDto(
                t.Id, t.Name, t.Description, variables,
                [.. lists],
                _renderer.RenderSubject(t.Subject, values),
                body,
                t.UpdatedAt);
        }));
    }

    [HttpGet("templates/{id:guid}")]
    public async Task<IActionResult> GetTemplate(Guid id, CancellationToken ct)
    {
        var orgId = OrgId();
        var t = await _db.EmailTemplates
            .FirstOrDefaultAsync(x => x.Id == id && x.OrganizationId == orgId, ct);
        return t is null ? NotFound(errorResponse("Template not found.")) : Ok(ToDto(t));
    }

    [HttpPost("templates")]
    public async Task<IActionResult> CreateTemplate(EmailTemplateUpsertRequest body, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(body.Name))
            return BadRequest(errorResponse("Template name is required."));
        var orgId = OrgId();
        var t = new EmailTemplate
        {
            OrganizationId = orgId,
            Name = body.Name.Trim(),
            Description = body.Description,
            Subject = body.Subject,
            BodyHtml = body.BodyHtml,
            VariablesJson = JsonSerializer.Serialize(body.Variables ?? Array.Empty<string>()),
            SkipBrandWrap = body.SkipBrandWrap
        };
        _db.EmailTemplates.Add(t);
        await _db.SaveChangesAsync(ct);
        await _audit.LogAsync(UserId(), ActorEmail(), "template.create",
            details: $"Template {t.Id} '{t.Name}'");
        return Ok(ToDto(t));
    }

    [HttpPut("templates/{id:guid}")]
    public async Task<IActionResult> UpdateTemplate(Guid id, EmailTemplateUpsertRequest body, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(body.Name))
            return BadRequest(errorResponse("Template name is required."));
        var orgId = OrgId();
        var t = await _db.EmailTemplates
            .FirstOrDefaultAsync(x => x.Id == id && x.OrganizationId == orgId, ct);
        if (t is null) return NotFound(errorResponse("Template not found."));
        t.Name = body.Name.Trim();
        t.Description = body.Description;
        t.Subject = body.Subject;
        t.BodyHtml = body.BodyHtml;
        t.VariablesJson = JsonSerializer.Serialize(body.Variables ?? Array.Empty<string>());
        t.SkipBrandWrap = body.SkipBrandWrap;
        t.UpdatedAt = DateTimeOffset.UtcNow;
        await _db.SaveChangesAsync(ct);
        await _audit.LogAsync(UserId(), ActorEmail(), "template.update",
            details: $"Template {t.Id} '{t.Name}'");
        return Ok(ToDto(t));
    }

    [HttpDelete("templates/{id:guid}")]
    public async Task<IActionResult> DeleteTemplate(Guid id, CancellationToken ct)
    {
        var orgId = OrgId();
        var t = await _db.EmailTemplates
            .FirstOrDefaultAsync(x => x.Id == id && x.OrganizationId == orgId, ct);
        if (t is null) return NotFound(errorResponse("Template not found."));
        var name = t.Name;
        _db.EmailTemplates.Remove(t);
        await _db.SaveChangesAsync(ct);
        await _audit.LogAsync(UserId(), ActorEmail(), "template.delete",
            details: $"Template {id} '{name}'");
        return NoContent();
    }

    /// <summary>
    /// Renders a subject/body with variables + (optionally) the brand kit wrapped around
    /// the body. Used by the editor's live preview and by the compose modal to seed
    /// a draft from a template.
    /// </summary>
    [HttpPost("templates/preview")]
    public async Task<IActionResult> Preview(TemplatePreviewRequest body, CancellationToken ct)
    {
        var orgId = OrgId();
        var kit = await GetOrCreateKitAsync(orgId, ct);

        // Example values are the floor, not the answer: the caller's own values are
        // layered on top. A form filled in halfway then previews as a finished email
        // with sample text where the gaps are, rather than one full of {{holes}}.
        var values = new Dictionary<string, string?>(TemplateSampleValues.For(body.Variables), StringComparer.Ordinal);
        if (body.Values is not null)
            foreach (var (key, value) in body.Values)
                if (!string.IsNullOrWhiteSpace(value)) values[key] = value;

        var listNames = TemplateRenderer.ListNames(body.BodyHtml);
        var lists = new Dictionary<string, IReadOnlyList<string>>(
            TemplateSampleValues.ListsFor(listNames), StringComparer.Ordinal);
        if (body.Lists is not null)
            foreach (var (key, items) in body.Lists)
            {
                var filled = items?.Where(i => !string.IsNullOrWhiteSpace(i)).ToList() ?? [];
                if (filled.Count > 0) lists[key] = filled;
            }

        var subject = _renderer.RenderSubject(body.Subject, values);
        var wrap = body.Wrap && !body.SkipBrandWrap;
        var rendered = _renderer.RenderBody(body.BodyHtml, values, kit, wrap, lists);
        return Ok(new TemplatePreviewResponse(subject, rendered));
    }

    private static BrandKitDto ToDto(BrandKit k) =>
        new(k.Id, k.Name, k.PrimaryColor, k.AccentColor, k.TextColor, k.BackgroundColor,
            k.LogoUrl, k.HeaderHtml, k.FooterHtml, k.SignatureHtml, k.UpdatedAt);

    private static EmailTemplateSummaryDto ToSummary(EmailTemplate t) =>
        new(t.Id, t.Name, t.Description, t.Subject, ParseVariables(t));

    private static EmailTemplateDto ToDto(EmailTemplate t) =>
        new(t.Id, t.Name, t.Description, t.Subject, t.BodyHtml,
            ParseVariables(t), t.SkipBrandWrap, t.CreatedAt, t.UpdatedAt);

    private static string[] ParseVariables(EmailTemplate t)
    {
        if (string.IsNullOrEmpty(t.VariablesJson)) return Array.Empty<string>();
        try { return JsonSerializer.Deserialize<string[]>(t.VariablesJson) ?? Array.Empty<string>(); }
        catch { return Array.Empty<string>(); }
    }

    private static object errorResponse(string message) => new { error = message };
}
