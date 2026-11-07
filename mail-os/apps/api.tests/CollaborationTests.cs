using System.Net;
using System.Net.Http.Json;
using Kompanion.Api.Data;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace Kompanion.Api.Tests;

/// <summary>
/// Regression cover for the two Phase 7 endpoints that were broken on arrival:
/// unassigning a thread always returned 400, and deleting a note always returned 404.
/// Both failed on their error paths, where a manual click-through reads as "the button
/// did nothing" rather than as a bug.
/// </summary>
public class CollaborationTests : IAsyncLifetime
{
    private TestAppFactory _factory = null!;

    public async ValueTask InitializeAsync()
    {
        _factory = new TestAppFactory();
        await _factory.InitializeAsync();
    }

    public async ValueTask DisposeAsync() => await _factory.DisposeAsync();

    // The client sends the all-zeros GUID to mean "unassign".
    private static readonly Guid Unassign = Guid.Empty;

    [Fact]
    public async Task Unassigning_a_thread_removes_the_assignment()
    {
        var admin = await ApiFixture.RegisterAdminAsync(_factory);
        var (_, threadId, _) = await ApiFixture.SeedThreadAsync(_factory, admin.UserId);

        var assign = await admin.Client.PostAsJsonAsync(
            $"/api/threads/{threadId}/assignment", new { userId = admin.UserId });
        assign.EnsureSuccessStatusCode();

        var unassign = await admin.Client.PostAsJsonAsync(
            $"/api/threads/{threadId}/assignment", new { userId = Unassign });

        // Used to be 400 "Assignee is not a member of this organization": the handler
        // looked Guid.Empty up as a real user before reaching the unassign branch.
        Assert.Equal(HttpStatusCode.NoContent, unassign.StatusCode);

        await using var db = _factory.NewDbContext();
        Assert.False(await db.ThreadAssignments.AnyAsync(a => a.ThreadId == threadId));
    }

    [Fact]
    public async Task Unassigning_an_unassigned_thread_is_a_no_op()
    {
        var admin = await ApiFixture.RegisterAdminAsync(_factory);
        var (_, threadId, _) = await ApiFixture.SeedThreadAsync(_factory, admin.UserId);

        var res = await admin.Client.PostAsJsonAsync(
            $"/api/threads/{threadId}/assignment", new { userId = Unassign });

        Assert.Equal(HttpStatusCode.NoContent, res.StatusCode);
    }

    [Fact]
    public async Task Assigning_to_a_real_member_still_works()
    {
        var admin = await ApiFixture.RegisterAdminAsync(_factory);
        var member = await ApiFixture.InviteAndRegisterAsync(_factory, admin, "member@test.local");
        var (_, threadId, _) = await ApiFixture.SeedThreadAsync(_factory, admin.UserId);

        var res = await admin.Client.PostAsJsonAsync(
            $"/api/threads/{threadId}/assignment", new { userId = member.UserId });
        res.EnsureSuccessStatusCode();

        await using var db = _factory.NewDbContext();
        var assignment = await db.ThreadAssignments.SingleAsync(a => a.ThreadId == threadId);
        Assert.Equal(member.UserId, assignment.UserId);
    }

    [Fact]
    public async Task Assigning_to_a_nonexistent_user_is_rejected()
    {
        var admin = await ApiFixture.RegisterAdminAsync(_factory);
        var (_, threadId, _) = await ApiFixture.SeedThreadAsync(_factory, admin.UserId);

        var res = await admin.Client.PostAsJsonAsync(
            $"/api/threads/{threadId}/assignment", new { userId = Guid.NewGuid() });

        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
    }

    [Fact]
    public async Task Author_can_delete_their_own_note()
    {
        var admin = await ApiFixture.RegisterAdminAsync(_factory);
        var (_, threadId, _) = await ApiFixture.SeedThreadAsync(_factory, admin.UserId);

        var create = await admin.Client.PostAsJsonAsync(
            $"/api/threads/{threadId}/notes", new { body = "Chase the invoice on Friday" });
        create.EnsureSuccessStatusCode();
        var note = await create.Content.ReadFromJsonAsync<NoteBody>();

        var delete = await admin.Client.DeleteAsync($"/api/notes/{note!.Id}");

        // Used to be 404 for everyone: the org check read MailboxConnection.User without
        // including it, so the comparison was always against null.
        Assert.Equal(HttpStatusCode.NoContent, delete.StatusCode);

        await using var db = _factory.NewDbContext();
        Assert.False(await db.ThreadNotes.AnyAsync(n => n.Id == note.Id));
    }

    [Fact]
    public async Task Admin_can_delete_another_members_note()
    {
        var admin = await ApiFixture.RegisterAdminAsync(_factory);
        var member = await ApiFixture.InviteAndRegisterAsync(_factory, admin, "member@test.local");
        var (_, threadId, _) = await ApiFixture.SeedThreadAsync(_factory, admin.UserId);

        var create = await member.Client.PostAsJsonAsync(
            $"/api/threads/{threadId}/notes", new { body = "Member's note" });
        create.EnsureSuccessStatusCode();
        var note = await create.Content.ReadFromJsonAsync<NoteBody>();

        var delete = await admin.Client.DeleteAsync($"/api/notes/{note!.Id}");
        Assert.Equal(HttpStatusCode.NoContent, delete.StatusCode);
    }

    [Fact]
    public async Task Member_cannot_delete_another_members_note()
    {
        var admin = await ApiFixture.RegisterAdminAsync(_factory);
        var author = await ApiFixture.InviteAndRegisterAsync(_factory, admin, "author@test.local");
        var other = await ApiFixture.InviteAndRegisterAsync(_factory, admin, "other@test.local");
        var (_, threadId, _) = await ApiFixture.SeedThreadAsync(_factory, admin.UserId);

        var create = await author.Client.PostAsJsonAsync(
            $"/api/threads/{threadId}/notes", new { body = "Not yours to delete" });
        create.EnsureSuccessStatusCode();
        var note = await create.Content.ReadFromJsonAsync<NoteBody>();

        var delete = await other.Client.DeleteAsync($"/api/notes/{note!.Id}");
        Assert.Equal(HttpStatusCode.Forbidden, delete.StatusCode);

        await using var db = _factory.NewDbContext();
        Assert.True(await db.ThreadNotes.AnyAsync(n => n.Id == note.Id));
    }

    [Fact]
    public async Task Notes_are_visible_to_every_member_of_the_org()
    {
        var admin = await ApiFixture.RegisterAdminAsync(_factory);
        var member = await ApiFixture.InviteAndRegisterAsync(_factory, admin, "member@test.local");
        var (_, threadId, _) = await ApiFixture.SeedThreadAsync(_factory, admin.UserId);

        (await admin.Client.PostAsJsonAsync($"/api/threads/{threadId}/notes",
            new { body = "Shared context" })).EnsureSuccessStatusCode();

        var notes = await member.Client.GetFromJsonAsync<List<NoteBody>>($"/api/threads/{threadId}/notes");
        Assert.Single(notes!);
    }

    private record NoteBody(Guid Id, Guid ThreadId, string Body);
}
