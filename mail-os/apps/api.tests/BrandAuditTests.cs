using System.Net.Http.Json;
using Xunit;

namespace Kompanion.Api.Tests;

/// <summary>
/// Shared brand kit and template edits are member-editable but audit-logged with
/// actor and object identifiers, never full HTML or secrets.
/// </summary>
public sealed class BrandAuditTests : IAsyncLifetime
{
    private TestAppFactory _factory = null!;

    public async ValueTask InitializeAsync()
    {
        _factory = new TestAppFactory();
        await _factory.InitializeAsync();
    }

    public async ValueTask DisposeAsync() => await _factory.DisposeAsync();

    private record AuditBody(long Id, string ActorEmail, string Action, string? TargetEmail, Guid? TargetMailboxId, string? Details, DateTimeOffset CreatedAt);

    private async Task<List<AuditBody>> AuditLogAsync(ApiFixture.Session admin) =>
        (await admin.Client.GetFromJsonAsync<List<AuditBody>>("/api/admin/audit-log"))!;

    [Fact]
    public async Task Brand_kit_update_is_audited_without_html()
    {
        var admin = await ApiFixture.RegisterAdminAsync(_factory);
        var update = await admin.Client.PutAsJsonAsync("/api/brand-kit", new
        {
            name = "Kwetu",
            primaryColor = "#FBB040",
            accentColor = "#F9ED32",
            textColor = "#171717",
            backgroundColor = "#FEFBD2",
            logoUrl = (string?)null,
            headerHtml = "<div>SECRET-HEADER-MARKER</div>",
            footerHtml = (string?)null,
            signatureHtml = (string?)null
        });
        update.EnsureSuccessStatusCode();

        var entries = await AuditLogAsync(admin);
        var entry = Assert.Single(entries, e => e.Action == "brandkit.update");
        Assert.Equal("admin@test.local", entry.ActorEmail);
        Assert.DoesNotContain("SECRET-HEADER-MARKER", entry.Details ?? "");
    }

    [Fact]
    public async Task Template_lifecycle_is_audited_with_object_identifiers()
    {
        var admin = await ApiFixture.RegisterAdminAsync(_factory);
        var created = await admin.Client.PostAsJsonAsync("/api/templates", new
        {
            name = "Welcome",
            description = (string?)null,
            subject = "Hi {{name}}",
            bodyHtml = "<p>SECRET-BODY-MARKER</p>",
            variables = new[] { "name" },
            skipBrandWrap = false
        });
        created.EnsureSuccessStatusCode();
        var template = await created.Content.ReadFromJsonAsync<TemplateBody>();
        Assert.NotNull(template);

        var updated = await admin.Client.PutAsJsonAsync($"/api/templates/{template.Id}", new
        {
            name = "Welcome v2",
            description = (string?)null,
            subject = "Hi {{name}}",
            bodyHtml = "<p>Hi</p>",
            variables = new[] { "name" },
            skipBrandWrap = false
        });
        updated.EnsureSuccessStatusCode();
        (await admin.Client.DeleteAsync($"/api/templates/{template.Id}")).EnsureSuccessStatusCode();

        var entries = await AuditLogAsync(admin);
        foreach (var action in new[] { "template.create", "template.update", "template.delete" })
        {
            var entry = Assert.Single(entries, e => e.Action == action);
            Assert.Equal("admin@test.local", entry.ActorEmail);
            Assert.Contains(template.Id.ToString(), entry.Details);
        }
        Assert.DoesNotContain(
            entries.Where(e => e.Action.StartsWith("template.")),
            e => (e.Details ?? "").Contains("SECRET-BODY-MARKER"));
    }

    private record TemplateBody(Guid Id, string Name);
}
