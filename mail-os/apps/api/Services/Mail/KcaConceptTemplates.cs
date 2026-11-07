using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Kompanion.Api.Data;
using Microsoft.EntityFrameworkCore;

namespace Kompanion.Api.Services.Mail;

public static class KcaConceptTemplates
{
    public sealed record Definition(string Key, string Name, string Description, string Subject,
        string BodyHtml, string[] Variables, bool SkipBrandWrap, string Sha256);

    private sealed record Catalog(string Collection, int DesignRevision, Definition[] Templates);
    public sealed record ImportResult(int Added, int Skipped, bool DryRun);

    private static readonly JsonSerializerOptions JsonOptions = new() { PropertyNameCaseInsensitive = true };
    public static IReadOnlyList<Definition> All { get; } = ReadJson<Catalog>("concepts.json").Templates;
    private static readonly Dictionary<string, string> PreviewValues = ReadJson<Dictionary<string, string>>("preview-values.json");
    private static readonly Lazy<string> PreviewPhoto = new(() =>
    {
        using var stream = OpenResource("preview-site.jpg");
        using var bytes = new MemoryStream();
        stream.CopyTo(bytes);
        return "data:image/jpeg;base64," + Convert.ToBase64String(bytes.ToArray());
    });

    private static Stream OpenResource(string name) =>
        typeof(KcaConceptTemplates).Assembly.GetManifestResourceStream("KcaConcepts." + name)
        ?? throw new InvalidOperationException($"Missing KCA collection resource: {name}");

    private static T ReadJson<T>(string name)
    {
        using var stream = OpenResource(name);
        return JsonSerializer.Deserialize<T>(stream, JsonOptions)
            ?? throw new InvalidOperationException($"Invalid KCA collection resource: {name}");
    }

    public static bool TryPreviewValue(string name, out string value)
    {
        if (name == "site_photo_url") { value = PreviewPhoto.Value; return true; }
        return PreviewValues.TryGetValue(name, out value!);
    }

    public static Guid TemplateId(int organizationId, string key) => new(
        SHA256.HashData(Encoding.UTF8.GetBytes(
            $"kwetu-kca-email-concepts-v1:{organizationId.ToString(System.Globalization.CultureInfo.InvariantCulture)}:{key}"))[..16]);

    public static async Task<ImportResult> ImportAsync(AppDbContext db, int organizationId,
        bool dryRun = false, CancellationToken ct = default)
    {
        if (organizationId <= 0 || !await db.Organizations.AnyAsync(o => o.Id == organizationId, ct))
            throw new ArgumentException("The requested organisation does not exist.", nameof(organizationId));

        await using var transaction = await db.Database.BeginTransactionAsync(ct);
        if (!dryRun)
        {
            // Serialise imports for this company so simultaneous runs cannot insert duplicates.
            await db.Database.ExecuteSqlInterpolatedAsync($"SELECT pg_advisory_xact_lock({1262682368}, {organizationId})", ct);
        }

        var ids = All.Select(t => TemplateId(organizationId, t.Key)).ToArray();
        var existing = (await db.EmailTemplates.AsNoTracking()
            .Where(t => t.OrganizationId == organizationId && ids.Contains(t.Id))
            .Select(t => t.Id).ToListAsync(ct)).ToHashSet();
        var missing = All.Where(t => !existing.Contains(TemplateId(organizationId, t.Key))).ToArray();

        if (!dryRun)
        {
            db.EmailTemplates.AddRange(missing.Select(t => new EmailTemplate
            {
                Id = TemplateId(organizationId, t.Key), OrganizationId = organizationId,
                Name = t.Name, Description = t.Description, Subject = t.Subject, BodyHtml = t.BodyHtml,
                VariablesJson = JsonSerializer.Serialize(t.Variables), SkipBrandWrap = t.SkipBrandWrap
            }));
            await db.SaveChangesAsync(ct);
            await transaction.CommitAsync(ct);
        }
        return new ImportResult(missing.Length, existing.Count, dryRun);
    }
}
