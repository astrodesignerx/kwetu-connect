using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Kompanion.Api.Data;
using Kompanion.Api.Models;
using Kompanion.Api.Services.Mail;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace Kompanion.Api.Tests;

public class ConceptTemplateImportTests : IAsyncLifetime
{
    private TestAppFactory _factory = null!;
    public async ValueTask InitializeAsync()
    {
        _factory = new TestAppFactory();
        await _factory.InitializeAsync();
    }
    public async ValueTask DisposeAsync() => await _factory.DisposeAsync();

    [Fact]
    public async Task Dry_run_and_invalid_target_leave_saved_work_untouched()
    {
        await ApiFixture.RegisterAdminAsync(_factory);
        await using var scope = _factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var orgId = await db.Organizations.Select(o => o.Id).FirstAsync();
        var result = await KcaConceptTemplates.ImportAsync(db, orgId, dryRun: true);
        Assert.Equal(17, result.Added);
        Assert.True(result.DryRun);
        Assert.Empty(await db.EmailTemplates.ToListAsync());
        await Assert.ThrowsAsync<ArgumentException>(() => KcaConceptTemplates.ImportAsync(db, int.MaxValue));
        Assert.Empty(await db.EmailTemplates.ToListAsync());
    }

    [Fact]
    public async Task Import_preserves_unrelated_rows_and_targets_only_the_requested_company()
    {
        await ApiFixture.RegisterAdminAsync(_factory);
        await using var scope = _factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var orgId = await db.Organizations.Select(o => o.Id).FirstAsync();
        var other = new Organization { Name = "Scoping fixture" };
        var saved = new EmailTemplate { OrganizationId = orgId, Name = KcaConceptTemplates.All[0].Name, BodyHtml = "Saved design" };
        db.Organizations.Add(other);
        db.EmailTemplates.Add(saved);
        await db.SaveChangesAsync();

        var result = await KcaConceptTemplates.ImportAsync(db, orgId);
        Assert.Equal(17, result.Added);
        Assert.Equal(18, await db.EmailTemplates.CountAsync(t => t.OrganizationId == orgId));
        Assert.False(await db.EmailTemplates.AnyAsync(t => t.OrganizationId == other.Id));
        Assert.Equal("Saved design", (await db.EmailTemplates.AsNoTracking().SingleAsync(t => t.Id == saved.Id)).BodyHtml);

        await KcaConceptTemplates.ImportAsync(db, other.Id);
        Assert.Equal(17, await db.EmailTemplates.CountAsync(t => t.OrganizationId == other.Id));
        Assert.Equal(35, await db.EmailTemplates.CountAsync());
    }

    [Fact]
    public async Task Repeat_import_preserves_staff_edits_and_only_restores_missing_definitions()
    {
        await ApiFixture.RegisterAdminAsync(_factory);
        await using var scope = _factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var orgId = await db.Organizations.Select(o => o.Id).FirstAsync();
        await KcaConceptTemplates.ImportAsync(db, orgId);
        var rows = await db.EmailTemplates.OrderBy(t => t.Name).ToListAsync();
        var edited = rows[0];
        edited.Name = "Our revised design";
        edited.BodyHtml = "Staff changes";
        edited.Subject = "Edited subject";
        await db.SaveChangesAsync();
        await db.Entry(edited).ReloadAsync();
        var timestamp = edited.UpdatedAt;

        var repeated = await KcaConceptTemplates.ImportAsync(db, orgId);
        Assert.Equal(0, repeated.Added);
        Assert.Equal(17, repeated.Skipped);
        await db.Entry(edited).ReloadAsync();
        Assert.Equal("Our revised design", edited.Name);
        Assert.Equal("Staff changes", edited.BodyHtml);
        Assert.Equal("Edited subject", edited.Subject);
        Assert.Equal(timestamp, edited.UpdatedAt);

        db.EmailTemplates.Remove(rows[1]);
        await db.SaveChangesAsync();
        Assert.Equal(1, (await KcaConceptTemplates.ImportAsync(db, orgId)).Added);
        Assert.Equal(17, await db.EmailTemplates.CountAsync());
    }

    [Fact]
    public async Task Imported_library_retains_content_fields_and_wrap_flags_and_previews_real_images()
    {
        var admin = await ApiFixture.RegisterAdminAsync(_factory);
        await using var scope = _factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var orgId = await db.Organizations.Select(o => o.Id).FirstAsync();
        await KcaConceptTemplates.ImportAsync(db, orgId);
        var rows = await db.EmailTemplates.AsNoTracking().ToDictionaryAsync(t => t.Id);
        Assert.Equal(17, KcaConceptTemplates.All.Count);
        foreach (var definition in KcaConceptTemplates.All)
        {
            var row = rows[KcaConceptTemplates.TemplateId(orgId, definition.Key)];
            Assert.Equal(definition.Subject, row.Subject);
            Assert.Equal(definition.BodyHtml, row.BodyHtml);
            Assert.Equal(definition.SkipBrandWrap, row.SkipBrandWrap);
            Assert.Equal(definition.Variables, JsonSerializer.Deserialize<string[]>(row.VariablesJson!));
            Assert.Equal(definition.Sha256, Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(row.BodyHtml!))).ToLowerInvariant());
        }

        var previews = await admin.Client.GetFromJsonAsync<EmailTemplatePreviewDto[]>("/api/templates/previews");
        Assert.Equal(17, previews!.Length);
        Assert.All(previews, p => Assert.DoesNotContain("{{", p.BodyHtml));
        var street = previews.Single(p => p.Name == "KCA / The street letter");
        Assert.Contains("src=\"data:image/jpeg;base64,", street.BodyHtml);
        Assert.StartsWith("<!doctype html>", street.BodyHtml);
        Assert.DoesNotContain("Test Org", street.BodyHtml);
        var invoice = previews.Single(p => p.Name == "KCA / Invoice due");
        Assert.Contains("max-width:640px", invoice.BodyHtml);
    }
}
