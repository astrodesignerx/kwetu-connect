using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Kompanion.Api.Data;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace Kompanion.Api.Tests;

/// <summary>
/// AdminController queried across every organization, including the "last remaining
/// admin" guard. Only one org exists in the current deployment, so these assert the
/// scoping directly against a second org inserted into the database.
/// </summary>
public class OrgScopingTests : IAsyncLifetime
{
    private TestAppFactory _factory = null!;

    public async ValueTask InitializeAsync()
    {
        _factory = new TestAppFactory();
        await _factory.InitializeAsync();
    }

    public async ValueTask DisposeAsync() => await _factory.DisposeAsync();

    /// <summary>Inserts a separate org with its own admin, bypassing the API.</summary>
    private async Task<(int OrgId, Guid UserId)> SeedForeignOrgAsync()
    {
        await using var db = _factory.NewDbContext();
        var org = new Organization { Name = "Other Company" };
        db.Organizations.Add(org);
        await db.SaveChangesAsync();

        var user = new User
        {
            OrganizationId = org.Id,
            Email = $"outsider-{Guid.NewGuid():N}@other.local",
            Username = $"outsider{Guid.NewGuid():N}"[..20],
            DisplayName = "Outsider",
            PasswordHash = "x",
            Role = UserRole.Admin
        };
        db.Users.Add(user);
        await db.SaveChangesAsync();

        return (org.Id, user.Id);
    }

    [Fact]
    public async Task User_list_excludes_other_organizations()
    {
        var admin = await ApiFixture.RegisterAdminAsync(_factory);
        var (_, foreignUserId) = await SeedForeignOrgAsync();

        var users = await admin.Client.GetFromJsonAsync<List<AdminUserBody>>("/api/admin/users");

        Assert.DoesNotContain(users!, u => u.Id == foreignUserId);
        Assert.Contains(users!, u => u.Id == admin.UserId);
    }

    [Fact]
    public async Task Role_of_a_user_in_another_org_cannot_be_changed()
    {
        var admin = await ApiFixture.RegisterAdminAsync(_factory);
        var (_, foreignUserId) = await SeedForeignOrgAsync();

        var res = await admin.Client.PatchAsJsonAsync(
            $"/api/admin/users/{foreignUserId}/role", new { role = "Member" });

        Assert.Equal(HttpStatusCode.NotFound, res.StatusCode);

        await using var db = _factory.NewDbContext();
        var untouched = await db.Users.SingleAsync(u => u.Id == foreignUserId);
        Assert.Equal(UserRole.Admin, untouched.Role);
    }

    [Fact]
    public async Task Last_admin_guard_counts_only_this_org()
    {
        var admin = await ApiFixture.RegisterAdminAsync(_factory);
        // Another org's admin must not make it look safe to demote the only one here.
        await SeedForeignOrgAsync();
        var member = await ApiFixture.InviteAndRegisterAsync(_factory, admin, "member@test.local");

        var demoteSelf = await member.Client.PatchAsJsonAsync(
            $"/api/admin/users/{admin.UserId}/role", new { role = "Member" });
        Assert.Equal(HttpStatusCode.Forbidden, demoteSelf.StatusCode); // member isn't an admin

        var demote = await admin.Client.PatchAsJsonAsync(
            $"/api/admin/users/{admin.UserId}/role", new { role = "Member" });
        Assert.Equal(HttpStatusCode.BadRequest, demote.StatusCode);
    }

    [Fact]
    public async Task Threads_in_another_org_are_not_readable()
    {
        var admin = await ApiFixture.RegisterAdminAsync(_factory);
        var (_, foreignUserId) = await SeedForeignOrgAsync();
        var (_, foreignThreadId, _) = await ApiFixture.SeedThreadAsync(_factory, foreignUserId);

        var res = await admin.Client.GetAsync($"/api/mail/threads/{foreignThreadId}");
        Assert.Equal(HttpStatusCode.NotFound, res.StatusCode);

        var adminView = await admin.Client.GetAsync($"/api/admin/threads/{foreignThreadId}");
        Assert.Equal(HttpStatusCode.NotFound, adminView.StatusCode);
    }

    [Fact]
    public async Task Mailbox_oversight_excludes_other_organizations()
    {
        var admin = await ApiFixture.RegisterAdminAsync(_factory);
        var (_, foreignUserId) = await SeedForeignOrgAsync();
        var (foreignConnectionId, _, _) = await ApiFixture.SeedThreadAsync(_factory, foreignUserId);
        await ApiFixture.SeedThreadAsync(_factory, admin.UserId);

        var boxes = await admin.Client.GetFromJsonAsync<List<MailboxBody>>("/api/admin/mailboxes");
        Assert.DoesNotContain(boxes!, b => b.Id == foreignConnectionId);

        var threads = await admin.Client.GetAsync($"/api/admin/mailboxes/{foreignConnectionId}/threads");
        Assert.Equal(HttpStatusCode.NotFound, threads.StatusCode);
    }

    [Fact]
    public async Task Notes_on_another_orgs_thread_are_rejected()
    {
        var admin = await ApiFixture.RegisterAdminAsync(_factory);
        var (_, foreignUserId) = await SeedForeignOrgAsync();
        var (_, foreignThreadId, _) = await ApiFixture.SeedThreadAsync(_factory, foreignUserId);

        var res = await admin.Client.PostAsJsonAsync(
            $"/api/threads/{foreignThreadId}/notes", new { body = "Should not land" });

        Assert.Equal(HttpStatusCode.NotFound, res.StatusCode);
    }

    /// <summary>
    /// A reply resolves its subject, recipient and References chain from the thread it
    /// replies to. Resolving that by thread id alone handed all three back to a caller
    /// in another org — the reply defaults leaked foreign mail.
    /// </summary>
    [Fact]
    public async Task Replying_to_another_orgs_thread_is_rejected()
    {
        var admin = await ApiFixture.RegisterAdminAsync(_factory);
        var (_, foreignUserId) = await SeedForeignOrgAsync();
        var (_, foreignThreadId, _) = await ApiFixture.SeedThreadAsync(_factory, foreignUserId, "Foreign subject");
        // The caller still needs a mailbox of their own to send from.
        var (ownConnectionId, _, _) = await ApiFixture.SeedThreadAsync(_factory, admin.UserId);

        var res = await admin.Client.PostAsJsonAsync("/api/mail/send", new
        {
            mailboxConnectionId = ownConnectionId,
            replyToThreadId = foreignThreadId,
            bodyHtml = "<p>Reply into someone else's thread</p>",
            idempotencyKey = $"org-scope-{Guid.NewGuid():N}"
        });

        Assert.Equal(HttpStatusCode.NotFound, res.StatusCode);
    }

    [Fact]
    public async Task Sharing_and_invitation_mailbox_ids_cannot_cross_organisations()
    {
        var ct = TestContext.Current.CancellationToken;
        var admin = await ApiFixture.RegisterAdminAsync(_factory);
        var (_, foreignUser) = await SeedForeignOrgAsync();
        var (outside, _, _) = await ApiFixture.SeedThreadAsync(_factory, foreignUser);
        var (own, _, _) = await ApiFixture.SeedThreadAsync(_factory, admin.UserId);
        foreach (var payload in new[] {
            new { email = "invite@test.local", mailboxIds = new[] { outside }, sendFromMailboxId = (Guid?)null },
            new { email = "invite@test.local", mailboxIds = Array.Empty<Guid>(), sendFromMailboxId = (Guid?)outside } })
            Assert.Equal(HttpStatusCode.BadRequest, (await admin.Client.PostAsJsonAsync("/api/admin/invitations", payload, ct)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await admin.Client.GetAsync($"/api/admin/mailboxes/{outside}/access", ct)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await admin.Client.PutAsJsonAsync($"/api/admin/mailboxes/{outside}/access", new { userIds = new[] { admin.UserId } }, ct)).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await admin.Client.PutAsJsonAsync($"/api/admin/mailboxes/{own}/access", new { userIds = new[] { foreignUser } }, ct)).StatusCode);
    }

    [Fact]
    public async Task Client_pages_and_brief_exclude_hidden_mail_but_keep_the_client()
    {
        var ct = TestContext.Current.CancellationToken;
        var admin = await ApiFixture.RegisterAdminAsync(_factory);
        var member = await ApiFixture.InviteAndRegisterAsync(_factory, admin, "member@test.local");
        var (_, hiddenThread, _) = await ApiFixture.SeedThreadAsync(_factory, admin.UserId, "Hidden conversation");
        var (_, visibleThread, _) = await ApiFixture.SeedThreadAsync(_factory, member.UserId, "Visible conversation");
        Guid companyId;
        await using (var db = _factory.NewDbContext())
        {
            var orgId = await db.Users.Where(u => u.Id == admin.UserId).Select(u => u.OrganizationId).SingleAsync(ct);
            var company = new Company { OrganizationId = orgId, Name = "Shared client" };
            db.Companies.Add(company); companyId = company.Id;
            db.ThreadCompanies.Add(new ThreadCompany { ThreadId = hiddenThread, CompanyId = companyId });
            db.ThreadAssignments.Add(new ThreadAssignment { ThreadId = hiddenThread, UserId = member.UserId, AssignedByUserId = admin.UserId });
            await db.SaveChangesAsync(ct);
        }
        var client = await member.Client.GetFromJsonAsync<JsonElement>($"/api/companies/{companyId}", ct);
        Assert.Equal(companyId, client.GetProperty("company").GetProperty("id").GetGuid());
        Assert.Empty(client.GetProperty("threads").EnumerateArray());
        var list = await member.Client.GetFromJsonAsync<JsonElement>("/api/companies", ct);
        Assert.Equal(0, list[0].GetProperty("threadCount").GetInt32());
        var insights = await member.Client.GetFromJsonAsync<JsonElement>($"/api/companies/{companyId}/insights", ct);
        Assert.Equal(0, insights.GetProperty("threadCount").GetInt32());
        Assert.Empty(insights.GetProperty("recentThreads").EnumerateArray());
        var activity = await member.Client.GetFromJsonAsync<JsonElement>("/api/companies/activity", ct);
        Assert.Equal(0, activity[0].GetProperty("threadCount").GetInt32());
        var brief = await member.Client.GetFromJsonAsync<JsonElement>("/api/mail/brief", ct);
        Assert.Equal(1, brief.GetProperty("unreadCount").GetInt32());
        Assert.DoesNotContain("Hidden conversation", brief.ToString());
        Assert.Contains("Visible conversation", brief.ToString());
    }

    [Fact]
    public async Task Client_contacts_use_only_visible_mail_for_names_and_counts()
    {
        var ct = TestContext.Current.CancellationToken;
        var admin = await ApiFixture.RegisterAdminAsync(_factory);
        var member = await ApiFixture.InviteAndRegisterAsync(_factory, admin, "member@test.local");
        var (_, hidden, hiddenMessage) = await ApiFixture.SeedThreadAsync(_factory, admin.UserId);
        var (_, visible, visibleMessage) = await ApiFixture.SeedThreadAsync(_factory, member.UserId);
        Guid companyId;
        await using (var db = _factory.NewDbContext())
        {
            var orgId = await db.Users.Where(u => u.Id == admin.UserId).Select(u => u.OrganizationId).SingleAsync(ct);
            var company = new Company { OrganizationId = orgId, Name = "Client", Domain = "client.test" };
            companyId = company.Id; db.Companies.Add(company);
            db.ThreadCompanies.AddRange(new ThreadCompany { CompanyId = company.Id, ThreadId = hidden },
                new ThreadCompany { CompanyId = company.Id, ThreadId = visible });
            var shared = new Contact { OrganizationId = orgId, Email = "shared@client.test", Name = "Hidden name", MessageCount = 99 };
            var privateContact = new Contact { OrganizationId = orgId, Email = "private@client.test", Name = "Private person", MessageCount = 77 };
            db.Contacts.AddRange(shared, privateContact);
            db.ThreadContacts.Add(new ThreadContact { ThreadId = visible, ContactId = shared.Id });
            var privateMail = await db.MailMessages.SingleAsync(m => m.Id == hiddenMessage, ct);
            privateMail.FromAddr = "private@client.test"; privateMail.ToAddrs = "Hidden name <shared@client.test>";
            var visibleMail = await db.MailMessages.SingleAsync(m => m.Id == visibleMessage, ct);
            visibleMail.FromAddr = "shared@client.test"; visibleMail.FromName = "Visible name";
            await db.SaveChangesAsync(ct);
        }
        var client = await member.Client.GetFromJsonAsync<JsonElement>($"/api/companies/{companyId}", ct);
        var contact = Assert.Single(client.GetProperty("contacts").EnumerateArray());
        Assert.Equal("shared@client.test", contact.GetProperty("email").GetString());
        Assert.Equal("Visible name", contact.GetProperty("name").GetString());
        Assert.Equal(1, contact.GetProperty("messageCount").GetInt32());
        var links = await member.Client.GetFromJsonAsync<JsonElement>($"/api/threads/{visible}/associations", ct);
        Assert.Equal(1, Assert.Single(links.GetProperty("contacts").EnumerateArray()).GetProperty("messageCount").GetInt32());
    }

    private record AdminUserBody(Guid Id, string Email, string Role);
    private record MailboxBody(Guid Id, string Email);
}
