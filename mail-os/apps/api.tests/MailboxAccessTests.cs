using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Kompanion.Api.Data;
using Kompanion.Api.Hubs;
using Kompanion.Api.Services.Ai;
using Kompanion.Api.Services.Mail;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace Kompanion.Api.Tests;

public sealed class MailboxAccessTests : IAsyncLifetime
{
    private AccessFactory _factory = null!;
    private static CancellationToken Ct => TestContext.Current.CancellationToken;
    public async ValueTask InitializeAsync()
    {
        _factory = new AccessFactory();
        await _factory.InitializeAsync();
    }
    public async ValueTask DisposeAsync() => await _factory.DisposeAsync();

    [Theory]
    [InlineData("threads")]
    [InlineData("search")]
    [InlineData("thread")]
    [InlineData("counts")]
    [InlineData("read")]
    [InlineData("move")]
    [InlineData("sync")]
    [InlineData("attachment")]
    [InlineData("drafts")]
    [InlineData("draft")]
    [InlineData("draft-save")]
    [InlineData("send")]
    [InlineData("assignment")]
    [InlineData("assignment-get")]
    [InlineData("notes")]
    [InlineData("note-create")]
    [InlineData("ai")]
    [InlineData("ai-reply")]
    [InlineData("state")]
    [InlineData("associations")]
    public async Task Mail_access_is_denied_then_granted_then_revoked(string action)
    {
        var admin = await ApiFixture.RegisterAdminAsync(_factory);
        var member = await ApiFixture.InviteAndRegisterAsync(_factory, admin, "member@test.local");
        var (box, thread, message) = await ApiFixture.SeedThreadAsync(_factory, admin.UserId);
        var draft = new MailDraft { MailboxConnectionId = box, Subject = "Keep this draft" };
        Guid attachmentId;
        await using (var stream = new MemoryStream("private bytes"u8.ToArray()))
        {
            var (key, size) = await _factory.AttachmentStore.SaveAsync(stream, Ct);
            await using var db = _factory.NewDbContext();
            db.MailDrafts.Add(draft);
            db.MailboxFolders.Add(new MailboxFolder { MailboxConnectionId = box, FullName = "Archive", UidValidity = 1, SpecialUse = FolderSpecialUse.Archive });
            var attachment = new MailAttachment { MessageId = message, OwnerUserId = member.UserId,
                FileName = "private.txt", ContentType = "text/plain", BlobKey = key, SizeBytes = size };
            db.MailAttachments.Add(attachment);
            await db.SaveChangesAsync(Ct);
            attachmentId = attachment.Id;
            var messageId = await db.MailMessages.Where(m => m.Id == message).Select(m => m.MessageId).SingleAsync(Ct);
            _factory.Mail.Folder("INBOX").Messages[1] = new FakeMessageState
            {
                MessageId = messageId,
                BuildMime = () => FakeMailSessionFactory.BuildMime(messageId!, "Test thread", "sender@example.com")
            };
            _factory.Mail.Folder("Archive");
        }

        Task<HttpResponseMessage> Call() => action switch
        {
            "threads" => member.Client.GetAsync($"/api/mail/threads?connectionId={box}", Ct),
            "search" => member.Client.GetAsync($"/api/mail/threads?connectionId={box}&q=Test", Ct),
            "thread" => member.Client.GetAsync($"/api/mail/threads/{thread}", Ct),
            "counts" => member.Client.GetAsync($"/api/mail/thread-counts?connectionId={box}", Ct),
            "read" => member.Client.PostAsJsonAsync($"/api/mail/threads/{thread}/read", new { read = true }, Ct),
            "move" => member.Client.PostAsJsonAsync($"/api/mail/threads/{thread}/move", new { target = "Archive" }, Ct),
            "sync" => member.Client.PostAsync($"/api/mail/mailboxes/{box}/sync", null, Ct),
            "attachment" => member.Client.GetAsync($"/api/mail/attachments/{attachmentId}", Ct),
            "drafts" => member.Client.GetAsync($"/api/mail/drafts?connectionId={box}", Ct),
            "draft" => member.Client.GetAsync($"/api/mail/drafts/{draft.Id}", Ct),
            "draft-save" => member.Client.PostAsJsonAsync("/api/mail/drafts", new { id = draft.Id, mailboxConnectionId = box, subject = "Updated" }, Ct),
            "send" => member.Client.PostAsJsonAsync("/api/mail/send", new { mailboxConnectionId = box, toAddrs = "client@test.local", bodyText = "Reply", idempotencyKey = "test-send" }, Ct),
            "assignment" => member.Client.PostAsJsonAsync($"/api/threads/{thread}/assignment", new { userId = member.UserId }, Ct),
            "assignment-get" => member.Client.GetAsync($"/api/threads/{thread}/assignment", Ct),
            "notes" => member.Client.GetAsync($"/api/threads/{thread}/notes", Ct),
            "note-create" => member.Client.PostAsJsonAsync($"/api/threads/{thread}/notes", new { body = "Private note" }, Ct),
            "ai" => member.Client.PostAsJsonAsync("/api/ai/summarize", new { threadId = thread }, Ct),
            "ai-reply" => member.Client.PostAsJsonAsync("/api/ai/reply", new { threadId = thread }, Ct),
            "state" => member.Client.PostAsJsonAsync($"/api/mail/threads/{thread}/state", new { state = "Done" }, Ct),
            "associations" => member.Client.GetAsync($"/api/threads/{thread}/associations", Ct),
            _ => throw new InvalidOperationException(action)
        };
        Assert.Equal(HttpStatusCode.NotFound, (await Call()).StatusCode);
        Assert.Empty((await member.Client.GetFromJsonAsync<JsonElement>("/api/mail/overview", Ct)).GetProperty("mailboxes").EnumerateArray());
        await ApiFixture.GrantAsync(_factory, box, member.UserId);
        var granted = await Call();
        Assert.True(granted.IsSuccessStatusCode, await granted.Content.ReadAsStringAsync(Ct));
        Assert.Single((await member.Client.GetFromJsonAsync<JsonElement>("/api/mail/overview", Ct)).GetProperty("mailboxes").EnumerateArray());
        (await admin.Client.PutAsJsonAsync($"/api/admin/mailboxes/{box}/access", new { userIds = Array.Empty<Guid>() }, Ct)).EnsureSuccessStatusCode();
        Assert.Equal(HttpStatusCode.NotFound, (await Call()).StatusCode);
        await using var check = _factory.NewDbContext();
        Assert.True(await check.MailDrafts.AnyAsync(d => d.Id == draft.Id, Ct));
        Assert.Empty((await member.Client.GetFromJsonAsync<JsonElement>("/api/mail/overview", Ct)).GetProperty("mailboxes").EnumerateArray());
    }

    [Fact]
    public async Task Admin_and_connector_keep_access_without_grants_and_only_they_can_manage()
    {
        var admin = await ApiFixture.RegisterAdminAsync(_factory);
        var owner = await ApiFixture.InviteAndRegisterAsync(_factory, admin, "owner@test.local");
        var reader = await ApiFixture.InviteAndRegisterAsync(_factory, admin, "reader@test.local");
        var (box, thread, _) = await ApiFixture.SeedThreadAsync(_factory, owner.UserId);
        await ApiFixture.GrantAsync(_factory, box, reader.UserId);
        foreach (var session in new[] { admin, owner, reader })
            (await session.Client.GetAsync($"/api/mail/threads/{thread}", Ct)).EnsureSuccessStatusCode();
        foreach (var session in new[] { admin, owner })
        {
            (await session.Client.GetAsync($"/api/mailboxes/{box}/sync-stats", Ct)).EnsureSuccessStatusCode();
            var listed = await session.Client.GetFromJsonAsync<JsonElement>("/api/mailboxes", Ct);
            Assert.True(listed[0].GetProperty("canManage").GetBoolean());
            Assert.Equal("owner", listed[0].GetProperty("connectedByName").GetString());
        }
        Assert.Equal(HttpStatusCode.NotFound, (await reader.Client.GetAsync($"/api/mailboxes/{box}/sync-stats", Ct)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await reader.Client.PostAsync($"/api/mailboxes/{box}/reverify", null, Ct)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await reader.Client.DeleteAsync($"/api/mailboxes/{box}", Ct)).StatusCode);
        var readersBoxes = await reader.Client.GetFromJsonAsync<JsonElement>("/api/mailboxes", Ct);
        Assert.False(readersBoxes[0].GetProperty("canManage").GetBoolean());
        (await admin.Client.DeleteAsync($"/api/mailboxes/{box}", Ct)).EnsureSuccessStatusCode();
        await using var db = _factory.NewDbContext();
        Assert.False(await db.MailboxAccess.AnyAsync(a => a.MailboxConnectionId == box, Ct));
    }

    [Fact]
    public async Task Migration_backfills_only_matching_organisations_and_is_idempotent()
    {
        var admin = await ApiFixture.RegisterAdminAsync(_factory);
        var member = await ApiFixture.InviteAndRegisterAsync(_factory, admin, "member@test.local");
        var (box, _, _) = await ApiFixture.SeedThreadAsync(_factory, admin.UserId);
        await using var db = _factory.NewDbContext();
        var foreign = new User { Organization = new Organization { Name = "Outside" }, Email = "other@test.local",
            Username = "outside", DisplayName = "Outside", PasswordHash = "unused" };
        db.Users.Add(foreign);
        await db.SaveChangesAsync(Ct);
        await db.Database.ExecuteSqlRawAsync(Kompanion.Api.Migrations.MailboxAccess.ExistingAccessSql, Ct);
        await db.Database.ExecuteSqlRawAsync(Kompanion.Api.Migrations.MailboxAccess.ExistingAccessSql, Ct);
        var grants = await db.MailboxAccess.Where(a => a.MailboxConnectionId == box).Select(a => a.UserId).ToListAsync(Ct);
        Assert.Equal(2, grants.Count);
        Assert.Contains(admin.UserId, grants);
        Assert.Contains(member.UserId, grants);
        Assert.DoesNotContain(foreign.Id, grants);
    }

    [Fact]
    public async Task Live_mail_events_resolve_current_viewers_for_each_send()
    {
        var admin = await ApiFixture.RegisterAdminAsync(_factory);
        var owner = await ApiFixture.InviteAndRegisterAsync(_factory, admin, "owner@test.local");
        var reader = await ApiFixture.InviteAndRegisterAsync(_factory, admin, "reader@test.local");
        var hidden = await ApiFixture.InviteAndRegisterAsync(_factory, admin, "hidden@test.local");
        var (box, thread, _) = await ApiFixture.SeedThreadAsync(_factory, owner.UserId);
        await ApiFixture.GrantAsync(_factory, box, reader.UserId);
        var hub = new CapturingHub();
        var notifier = new MailNotifier(hub, _factory.Services.GetRequiredService<IServiceScopeFactory>());
        await using var db = _factory.NewDbContext();
        var connection = await db.MailboxConnections.SingleAsync(c => c.Id == box, Ct);
        await notifier.NotifyThreadsChangedAsync(owner.UserId, box);
        await notifier.NotifySyncStateAsync(connection);
        await notifier.NotifyAssignmentChangedAsync(0, box, thread, reader.UserId);
        await notifier.NotifyNotesChangedAsync(0, thread);
        Assert.Equal(new[] { "threadsChanged", "mailboxSyncState", "threadAssigned", "threadNotesChanged" }, hub.Sent.Select(e => e.Method));
        foreach (var sent in hub.Sent)
        {
            Assert.Contains($"user-{admin.UserId}", sent.Groups);
            Assert.Contains($"user-{owner.UserId}", sent.Groups);
            Assert.Contains($"user-{reader.UserId}", sent.Groups);
            Assert.DoesNotContain($"user-{hidden.UserId}", sent.Groups);
            Assert.All(sent.Groups, group => Assert.StartsWith("user-", group));
        }
        db.MailboxAccess.Remove(await db.MailboxAccess.SingleAsync(a => a.UserId == reader.UserId && a.MailboxConnectionId == box, Ct));
        await db.SaveChangesAsync(Ct);
        hub.Sent.Clear();
        await notifier.NotifyThreadsChangedAsync(owner.UserId, box);
        Assert.DoesNotContain($"user-{reader.UserId}", Assert.Single(hub.Sent).Groups);
        await notifier.NotifyAccessChangedAsync(box, [reader.UserId]);
        Assert.Equal("mailboxAccessChanged", hub.Sent.Last().Method);
        Assert.Equal(new[] { $"user-{reader.UserId}" }, hub.Sent.Last().Groups);
    }

    [Fact]
    public async Task Sharing_replaces_only_explicit_grants_and_audits_each_change()
    {
        var admin = await ApiFixture.RegisterAdminAsync(_factory);
        var owner = await ApiFixture.InviteAndRegisterAsync(_factory, admin, "owner@test.local");
        var reader = await ApiFixture.InviteAndRegisterAsync(_factory, admin, "reader@test.local");
        var (box, _, _) = await ApiFixture.SeedThreadAsync(_factory, owner.UserId);
        var granted = await admin.Client.PutAsJsonAsync($"/api/admin/mailboxes/{box}/access", new
        {
            userIds = new[] { admin.UserId, owner.UserId, reader.UserId, reader.UserId }
        }, Ct);
        granted.EnsureSuccessStatusCode();
        var listed = await admin.Client.GetFromJsonAsync<JsonElement>($"/api/admin/mailboxes/{box}/access", Ct);
        Assert.Equal("admin", listed.EnumerateArray().Single(u => u.GetProperty("userId").GetGuid() == admin.UserId).GetProperty("reason").GetString());
        Assert.Equal("connected", listed.EnumerateArray().Single(u => u.GetProperty("userId").GetGuid() == owner.UserId).GetProperty("reason").GetString());
        Assert.Equal("granted", listed.EnumerateArray().Single(u => u.GetProperty("userId").GetGuid() == reader.UserId).GetProperty("reason").GetString());
        await using (var db = _factory.NewDbContext())
        {
            Assert.Equal(reader.UserId, (await db.MailboxAccess.SingleAsync(Ct)).UserId);
            Assert.True(await db.AuditLogEntries.AnyAsync(a => a.Action == "admin.mailbox.access.grant" && a.TargetUserId == reader.UserId, Ct));
        }
        Assert.Equal(HttpStatusCode.Forbidden, (await reader.Client.GetAsync($"/api/admin/mailboxes/{box}/access", Ct)).StatusCode);
        (await admin.Client.PutAsJsonAsync($"/api/admin/mailboxes/{box}/access", new { userIds = Array.Empty<Guid>() }, Ct)).EnsureSuccessStatusCode();
        await using var check = _factory.NewDbContext();
        Assert.Empty(await check.MailboxAccess.ToListAsync(Ct));
        Assert.True(await check.AuditLogEntries.AnyAsync(a => a.Action == "admin.mailbox.access.revoke" && a.TargetUserId == reader.UserId, Ct));
    }

    [Fact]
    public async Task Duplicate_mailbox_is_checked_across_the_organisation_before_connecting()
    {
        var admin = await ApiFixture.RegisterAdminAsync(_factory);
        var member = await ApiFixture.InviteAndRegisterAsync(_factory, admin, "member@test.local");
        var (box, _, _) = await ApiFixture.SeedThreadAsync(_factory, admin.UserId);
        await using var db = _factory.NewDbContext();
        var email = await db.MailboxConnections.Where(c => c.Id == box).Select(c => c.Email).SingleAsync(Ct);
        var response = await member.Client.PostAsJsonAsync("/api/mailboxes", new { email, password = "never transmitted" }, Ct);
        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Contains("That mailbox is already connected.", await response.Content.ReadAsStringAsync(Ct));
        Assert.Equal(1, await db.MailboxConnections.CountAsync(Ct));
    }

    [Fact]
    public async Task Revocation_hides_bound_uploads_even_from_their_uploader_and_preserves_the_draft()
    {
        var admin = await ApiFixture.RegisterAdminAsync(_factory);
        var member = await ApiFixture.InviteAndRegisterAsync(_factory, admin, "member@test.local");
        var (box, thread, message) = await ApiFixture.SeedThreadAsync(_factory, admin.UserId);
        var (own, _, _) = await ApiFixture.SeedThreadAsync(_factory, member.UserId);
        var draft = new MailDraft { MailboxConnectionId = box };
        var note = new ThreadNote { ThreadId = thread, AuthorUserId = member.UserId, Body = "Note" };
        Guid attachmentId;
        await using (var db = _factory.NewDbContext())
        {
            using var stream = new MemoryStream("private"u8.ToArray());
            var (key, size) = await _factory.AttachmentStore.SaveAsync(stream, Ct);
            db.MailDrafts.Add(draft); db.ThreadNotes.Add(note);
            var attachment = new MailAttachment { DraftId = draft.Id, OwnerUserId = member.UserId,
                FileName = "private.txt", BlobKey = key, SizeBytes = size, ContentType = "text/plain" };
            db.MailAttachments.Add(attachment); attachmentId = attachment.Id;
            await db.SaveChangesAsync(Ct);
        }
        Assert.Equal(HttpStatusCode.NotFound, (await member.Client.GetAsync($"/api/mail/attachments/{attachmentId}", Ct)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await member.Client.DeleteAsync($"/api/mail/attachments/{attachmentId}", Ct)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await member.Client.DeleteAsync($"/api/mail/drafts/{draft.Id}", Ct)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await member.Client.DeleteAsync($"/api/notes/{note.Id}", Ct)).StatusCode);
        // Supplying a hidden reply target under a visible mailbox cannot reveal its headers.
        var reply = await member.Client.PostAsJsonAsync("/api/mail/drafts", new
        {
            id = Guid.NewGuid(), mailboxConnectionId = own, replyToThreadId = thread, replyToMessageId = message
        }, Ct);
        Assert.Equal(HttpStatusCode.NotFound, reply.StatusCode);
        await ApiFixture.GrantAsync(_factory, box, member.UserId);
        (await member.Client.GetAsync($"/api/mail/attachments/{attachmentId}", Ct)).EnsureSuccessStatusCode();
        (await admin.Client.PutAsJsonAsync($"/api/admin/mailboxes/{box}/access", new { userIds = Array.Empty<Guid>() }, Ct)).EnsureSuccessStatusCode();
        Assert.Equal(HttpStatusCode.NotFound, (await member.Client.DeleteAsync($"/api/mail/attachments/{attachmentId}", Ct)).StatusCode);
        await using var check = _factory.NewDbContext();
        Assert.True(await check.MailDrafts.AnyAsync(d => d.Id == draft.Id, Ct));
        Assert.True(await check.ThreadNotes.AnyAsync(n => n.Id == note.Id, Ct));
    }

    private sealed class AccessFactory : FakeMailTestFactory
    {
        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            base.ConfigureWebHost(builder);
            builder.ConfigureServices(services =>
            {
                services.PostConfigure<LlmOptions>(options => options.ApiKey = "test-only");
                services.AddHttpClient("llm").ConfigurePrimaryHttpMessageHandler(() => new LlmHandler());
            });
        }
    }
    private sealed class LlmHandler : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct) =>
            Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK)
            {
                Content = JsonContent.Create(new { choices = new[] { new { message = new { role = "assistant", content = "A test summary" } } } })
            });
    }
    private sealed class CapturingHub : IHubContext<MailHub>
    {
        public List<(string Method, string[] Groups)> Sent { get; } = [];
        public IHubClients Clients => new CapturingClients(this);
        public IGroupManager Groups => throw new NotSupportedException();
        private sealed class Proxy(CapturingHub hub, string[] groups) : IClientProxy
        {
            public Task SendCoreAsync(string method, object?[] args, CancellationToken cancellationToken = default)
            {
                hub.Sent.Add((method, groups));
                return Task.CompletedTask;
            }
        }
        private sealed class CapturingClients(CapturingHub hub) : IHubClients
        {
            public IClientProxy Groups(IReadOnlyList<string> groupNames) => new Proxy(hub, groupNames.ToArray());
            public IClientProxy Group(string groupName) => new Proxy(hub, [groupName]);
            public IClientProxy All => throw new NotSupportedException();
            public IClientProxy AllExcept(IReadOnlyList<string> ids) => throw new NotSupportedException();
            public IClientProxy Client(string id) => throw new NotSupportedException();
            public IClientProxy Clients(IReadOnlyList<string> ids) => throw new NotSupportedException();
            public IClientProxy GroupExcept(string name, IReadOnlyList<string> ids) => throw new NotSupportedException();
            public IClientProxy User(string id) => throw new NotSupportedException();
            public IClientProxy Users(IReadOnlyList<string> ids) => throw new NotSupportedException();
        }
    }
}
