using Kompanion.Api.Data;
using Kompanion.Api.Services.Mail;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace Kompanion.Api.Tests;

/// <summary>
/// Mail actions open every source folder (the Inbox included), check UIDVALIDITY,
/// hold the mailbox gate, and only remove rows whose move actually succeeded.
/// </summary>
public sealed class MailActionTests : IAsyncLifetime
{
    private FakeMailTestFactory _factory = null!;
    private readonly List<IServiceScope> _scopes = new();

    public async ValueTask InitializeAsync()
    {
        _factory = new FakeMailTestFactory();
        await _factory.InitializeAsync();
    }

    public async ValueTask DisposeAsync()
    {
        foreach (var scope in _scopes) scope.Dispose();
        await _factory.DisposeAsync();
    }

    private MailActionService Actions()
    {
        var scope = _factory.Services.CreateScope();
        _scopes.Add(scope);
        return scope.ServiceProvider.GetRequiredService<MailActionService>();
    }

    [Fact]
    public async Task Set_read_opens_the_inbox_and_marks_seen()
    {
        var admin = await ApiFixture.RegisterAdminAsync(_factory);
        var (connectionId, threadId, _) = await ApiFixture.SeedThreadAsync(_factory, admin.UserId);
        _factory.Mail.Folder("INBOX").Messages[1] = new FakeMessageState
        {
            MessageId = "m1",
            Seen = false,
            BuildMime = () => FakeMailSessionFactory.BuildMime("m1", "Test thread", "sender@example.com")
        };

        await Actions().SetThreadReadAsync(threadId, admin.UserId, read: true, CancellationToken.None);

        Assert.Contains("INBOX", _factory.Mail.OpenedFolders);
        var seen = Assert.Single(_factory.Mail.SeenCalls);
        Assert.Equal("INBOX", seen.Folder);
        Assert.Equal(new List<uint> { 1 }, seen.Uids);
        Assert.True(seen.Read);
        await using var db = _factory.NewDbContext();
        var flags = await db.MailMessages.Where(m => m.ThreadId == threadId).Select(m => m.Flags).SingleAsync();
        Assert.Contains("Seen", flags);
    }

    [Fact]
    public async Task Set_read_with_stale_uidvalidity_fails_without_touching_rows()
    {
        var admin = await ApiFixture.RegisterAdminAsync(_factory);
        var (_, threadId, _) = await ApiFixture.SeedThreadAsync(_factory, admin.UserId);
        _factory.Mail.Folder("INBOX").UidValidity = 999;
        _factory.Mail.Folder("INBOX").Messages[1] = new FakeMessageState { MessageId = "m1" };

        var ex = await Assert.ThrowsAsync<InvalidOperationException>(() =>
            Actions().SetThreadReadAsync(threadId, admin.UserId, read: true, CancellationToken.None));

        Assert.Contains("UIDVALIDITY", ex.Message);
        Assert.Empty(_factory.Mail.SeenCalls);
        await using var db = _factory.NewDbContext();
        var flags = await db.MailMessages.Where(m => m.ThreadId == threadId).Select(m => m.Flags).SingleAsync();
        Assert.DoesNotContain("Seen", flags);
    }

    [Fact]
    public async Task Missing_source_folder_fails_without_touching_rows()
    {
        var admin = await ApiFixture.RegisterAdminAsync(_factory);
        var (_, threadId, _) = await ApiFixture.SeedThreadAsync(_factory, admin.UserId);
        // No INBOX programmed on the fake server: open fails.

        var ex = await Assert.ThrowsAsync<InvalidOperationException>(() =>
            Actions().SetThreadReadAsync(threadId, admin.UserId, read: true, CancellationToken.None));

        Assert.Contains("INBOX", ex.Message);
        await using var db = _factory.NewDbContext();
        Assert.Equal(1, await db.MailMessages.CountAsync(m => m.ThreadId == threadId));
    }

    [Fact]
    public async Task Partial_move_removes_only_moved_rows_and_rebuilds()
    {
        var admin = await ApiFixture.RegisterAdminAsync(_factory);
        var (connectionId, threadId, _) = await ApiFixture.SeedThreadAsync(_factory, admin.UserId);

        await using (var seedDb = _factory.NewDbContext())
        {
            var work = new MailboxFolder
            {
                MailboxConnectionId = connectionId,
                FullName = "Work",
                UidValidity = 1,
                SpecialUse = FolderSpecialUse.None
            };
            var archive = new MailboxFolder
            {
                MailboxConnectionId = connectionId,
                FullName = "Archive",
                UidValidity = 1,
                SpecialUse = FolderSpecialUse.Archive
            };
            seedDb.MailboxFolders.AddRange(work, archive);
            seedDb.MailMessages.Add(new MailMessage
            {
                MailboxConnectionId = connectionId,
                FolderId = work.Id,
                ThreadId = threadId,
                Uid = 7,
                UidValidity = 1,
                MessageId = "<w@test.local>",
                Subject = "Test thread",
                FromAddr = "sender@example.com",
                MessageDate = DateTimeOffset.UtcNow
            });
            await seedDb.SaveChangesAsync();
        }

        _factory.Mail.Folder("INBOX").Messages[1] = new FakeMessageState { MessageId = "<i@test.local>" };
        _factory.Mail.Folder("Work").Messages[7] = new FakeMessageState { MessageId = "<w@test.local>" };
        _factory.Mail.Folder("Work").FailMove = true;
        _factory.Mail.Folder("Archive");

        var ex = await Assert.ThrowsAsync<InvalidOperationException>(() =>
            Actions().MoveThreadAsync(threadId, admin.UserId, "Archive", CancellationToken.None));

        Assert.Contains("1 of 2", ex.Message);
        var move = Assert.Single(_factory.Mail.Moves);
        Assert.Equal("INBOX", move.From);
        await using var db = _factory.NewDbContext();
        // The moved INBOX row was re-pointed at Archive with its server UID; the
        // failed Work row survives untouched. The thread id is preserved.
        Assert.Equal(2, await db.MailMessages.CountAsync(m => m.MailboxConnectionId == connectionId));
        var inboxRow = await db.MailMessages.SingleAsync(m => m.Uid == 1);
        var archiveId = await db.MailboxFolders
            .Where(f => f.MailboxConnectionId == connectionId && f.SpecialUse == FolderSpecialUse.Archive)
            .Select(f => f.Id).SingleAsync();
        Assert.Equal(archiveId, inboxRow.FolderId);
        Assert.Equal((uint)7, await db.MailMessages
            .Where(m => m.MailboxConnectionId == connectionId && m.Uid != 1)
            .Select(m => m.Uid).SingleAsync());
        var thread = await db.MailThreads.SingleAsync(t => t.Id == threadId);
        Assert.Equal(2, thread.MessageCount);
    }

    [Fact]
    public async Task Set_read_marks_unread_both_directions()
    {
        var admin = await ApiFixture.RegisterAdminAsync(_factory);
        var (_, threadId, _) = await ApiFixture.SeedThreadAsync(_factory, admin.UserId);
        _factory.Mail.Folder("INBOX").Messages[1] = new FakeMessageState { MessageId = "m1", Seen = false };

        await Actions().SetThreadReadAsync(threadId, admin.UserId, read: true, CancellationToken.None);
        await using (var db = _factory.NewDbContext())
        {
            Assert.False((await db.MailThreads.SingleAsync(t => t.Id == threadId)).HasUnread);
            Assert.Contains("Seen", (await db.MailMessages.SingleAsync(m => m.ThreadId == threadId)).Flags);
        }

        await Actions().SetThreadReadAsync(threadId, admin.UserId, read: false, CancellationToken.None);
        await using (var db = _factory.NewDbContext())
        {
            Assert.True((await db.MailThreads.SingleAsync(t => t.Id == threadId)).HasUnread);
            Assert.DoesNotContain("Seen", (await db.MailMessages.SingleAsync(m => m.ThreadId == threadId)).Flags);
        }
    }

    [Fact]
    public async Task Set_read_holds_the_gate_during_remote_work()
    {
        var admin = await ApiFixture.RegisterAdminAsync(_factory);
        var (connectionId, threadId, _) = await ApiFixture.SeedThreadAsync(_factory, admin.UserId);
        var gate = _factory.Services.GetRequiredService<MailboxSyncGate>();
        var enteredByOther = true;
        _factory.Mail.Folder("INBOX").Messages[1] = new FakeMessageState { MessageId = "m1" };
        _factory.Mail.Folder("INBOX").OnSetSeen = async () =>
        {
            // A concurrent sync for the same mailbox must not enter while the
            // action holds the gate.
            enteredByOther = await gate.TryEnterAsync(connectionId, CancellationToken.None);
            if (enteredByOther) gate.Release(connectionId);
            await Task.CompletedTask;
        };

        await Actions().SetThreadReadAsync(threadId, admin.UserId, read: true, CancellationToken.None);
        Assert.False(enteredByOther);
    }

    [Fact]
    public async Task Set_read_partial_failure_commits_confirmed_folders()
    {
        var admin = await ApiFixture.RegisterAdminAsync(_factory);
        var (connectionId, threadId, _) = await ApiFixture.SeedThreadAsync(_factory, admin.UserId);
        await using (var seedDb = _factory.NewDbContext())
        {
            seedDb.MailboxFolders.Add(new MailboxFolder
            {
                MailboxConnectionId = connectionId,
                FullName = "Work",
                UidValidity = 1,
                SpecialUse = FolderSpecialUse.None
            });
            await seedDb.SaveChangesAsync();
            var workId = await seedDb.MailboxFolders
                .Where(f => f.FullName == "Work").Select(f => f.Id).SingleAsync();
            seedDb.MailMessages.Add(new MailMessage
            {
                MailboxConnectionId = connectionId,
                FolderId = workId,
                ThreadId = threadId,
                Uid = 7,
                UidValidity = 1,
                MessageId = "<w@test.local>",
                Subject = "Test thread",
                FromAddr = "sender@example.com",
                MessageDate = DateTimeOffset.UtcNow
            });
            await seedDb.SaveChangesAsync();
        }
        _factory.Mail.Folder("INBOX").Messages[1] = new FakeMessageState { MessageId = "<i@test.local>" };
        _factory.Mail.Folder("Work").FailOpen = true;

        var ex = await Assert.ThrowsAsync<InvalidOperationException>(() =>
            Actions().SetThreadReadAsync(threadId, admin.UserId, read: true, CancellationToken.None));

        Assert.Contains("1 of 2", ex.Message);
        await using var db = _factory.NewDbContext();
        Assert.Contains("Seen", (await db.MailMessages.SingleAsync(m => m.Uid == 1)).Flags);
        Assert.DoesNotContain("Seen", (await db.MailMessages.SingleAsync(m => m.Uid == 7)).Flags);
        Assert.True((await db.MailThreads.SingleAsync(t => t.Id == threadId)).HasUnread);
    }

    [Fact]
    public async Task Set_read_cancellation_keeps_confirmed_work()
    {
        var admin = await ApiFixture.RegisterAdminAsync(_factory);
        var (connectionId, threadId, _) = await ApiFixture.SeedThreadAsync(_factory, admin.UserId);
        await using (var seedDb = _factory.NewDbContext())
        {
            seedDb.MailboxFolders.Add(new MailboxFolder
            {
                MailboxConnectionId = connectionId,
                FullName = "Work",
                UidValidity = 1,
                SpecialUse = FolderSpecialUse.None
            });
            await seedDb.SaveChangesAsync();
            var workId = await seedDb.MailboxFolders
                .Where(f => f.FullName == "Work").Select(f => f.Id).SingleAsync();
            seedDb.MailMessages.Add(new MailMessage
            {
                MailboxConnectionId = connectionId,
                FolderId = workId,
                ThreadId = threadId,
                Uid = 7,
                UidValidity = 1,
                MessageId = "<w@test.local>",
                Subject = "Test thread",
                FromAddr = "sender@example.com",
                MessageDate = DateTimeOffset.UtcNow
            });
            await seedDb.SaveChangesAsync();
        }
        _factory.Mail.Folder("INBOX").Messages[1] = new FakeMessageState { MessageId = "<i@test.local>" };
        _factory.Mail.Folder("Work").Messages[7] = new FakeMessageState { MessageId = "<w@test.local>" };
        _factory.Mail.Folder("Work").CancelOnSetSeen = true;

        // Folders order is not guaranteed; either folder may win the race to be
        // first. Either way the confirmed folder is committed and the outcome is
        // reported as cancellation.
        await Assert.ThrowsAsync<OperationCanceledException>(() =>
            Actions().SetThreadReadAsync(threadId, admin.UserId, read: true, CancellationToken.None));

        await using var db = _factory.NewDbContext();
        var seenCount = await db.MailMessages.CountAsync(m => m.ThreadId == threadId && m.Flags.Contains("Seen"));
        Assert.Equal(1, seenCount);
    }

    [Fact]
    public async Task Moving_a_folder_into_itself_is_a_no_op()
    {
        var admin = await ApiFixture.RegisterAdminAsync(_factory);
        var (connectionId, threadId, _) = await ApiFixture.SeedThreadAsync(_factory, admin.UserId);

        Guid archiveId;
        await using (var seedDb = _factory.NewDbContext())
        {
            var inbox = await seedDb.MailboxFolders.SingleAsync(f => f.MailboxConnectionId == connectionId);
            inbox.SpecialUse = FolderSpecialUse.Archive;
            inbox.FullName = "Archive";
            await seedDb.SaveChangesAsync();
            archiveId = inbox.Id;
        }
        _factory.Mail.Folder("Archive").Messages[1] = new FakeMessageState { MessageId = "m1" };

        await Actions().MoveThreadAsync(threadId, admin.UserId, "Archive", CancellationToken.None);

        await using var db = _factory.NewDbContext();
        Assert.Equal(1, await db.MailMessages.CountAsync(m => m.MailboxConnectionId == connectionId));
        Assert.Equal(archiveId, await db.MailMessages.Select(m => m.FolderId).SingleAsync());
        Assert.Empty(_factory.Mail.Moves);
    }

    [Fact]
    public async Task Archive_move_preserves_thread_metadata_then_sync_keeps_it()
    {
        var admin = await ApiFixture.RegisterAdminAsync(_factory);
        var (connectionId, seededThreadId, _) = await ApiFixture.SeedThreadAsync(_factory, admin.UserId);

        // Rebuild once so the thread id is the deterministic builder id, as in
        // production; the move and the later sync must both preserve it.
        Guid threadId;
        using (var buildScope = _factory.Services.CreateScope())
        {
            await buildScope.ServiceProvider.GetRequiredService<ThreadingService>()
                .RebuildAsync(connectionId, CancellationToken.None);
        }
        await using (var db = _factory.NewDbContext())
            threadId = (await db.MailThreads.SingleAsync(t => t.MailboxConnectionId == connectionId)).Id;
        Assert.NotEqual(seededThreadId, threadId);
        int orgId;
        await using (var seedDb = _factory.NewDbContext())
        {
            seedDb.MailboxFolders.Add(new MailboxFolder
            {
                MailboxConnectionId = connectionId,
                FullName = "Archive",
                UidValidity = 1,
                SpecialUse = FolderSpecialUse.Archive
            });
            var company = new Company { OrganizationId = 0, Name = "Acme" };
            orgId = (await seedDb.Users.SingleAsync(u => u.Id == admin.UserId)).OrganizationId;
            company.OrganizationId = orgId;
            seedDb.Companies.Add(company);
            await seedDb.SaveChangesAsync();
            var project = new Project { CompanyId = company.Id, Name = "Site" };
            seedDb.Projects.Add(project);
            await seedDb.SaveChangesAsync();
            seedDb.ThreadCompanies.Add(new ThreadCompany { ThreadId = threadId, CompanyId = company.Id });
            seedDb.ThreadProjects.Add(new ThreadProject { ThreadId = threadId, ProjectId = project.Id });
            seedDb.ThreadAssignments.Add(new ThreadAssignment
            {
                ThreadId = threadId,
                UserId = admin.UserId,
                AssignedByUserId = admin.UserId
            });
            seedDb.ThreadNotes.Add(new ThreadNote
            {
                ThreadId = threadId,
                AuthorUserId = admin.UserId,
                Body = "Call them back"
            });
            await seedDb.SaveChangesAsync();
        }
        _factory.Mail.Folder("INBOX").Messages[1] = new FakeMessageState
        {
            MessageId = "<move@test.local>",
            Seen = false,
            BuildMime = () => FakeMailSessionFactory.BuildMime("<move@test.local>", "Test thread", "sender@example.com")
        };
        _factory.Mail.Folder("Archive");

        await Actions().MoveThreadAsync(threadId, admin.UserId, "Archive", CancellationToken.None);

        await using (var db = _factory.NewDbContext())
        {
            // Same thread row, same id; messages re-pointed at Archive.
            var thread = await db.MailThreads.SingleAsync(t => t.Id == threadId);
            Assert.Equal(1, thread.MessageCount);
            var archiveId = await db.MailboxFolders
                .Where(f => f.SpecialUse == FolderSpecialUse.Archive)
                .Select(f => f.Id).SingleAsync();
            Assert.Equal(archiveId, (await db.MailMessages.SingleAsync(m => m.ThreadId == threadId)).FolderId);
            Assert.Equal(1, await db.ThreadNotes.CountAsync(n => n.ThreadId == threadId));
            Assert.NotNull(await db.ThreadAssignments.SingleOrDefaultAsync(a => a.ThreadId == threadId));
            Assert.Equal(1, await db.ThreadCompanies.CountAsync(c => c.ThreadId == threadId));
            Assert.Equal(1, await db.ThreadProjects.CountAsync(p => p.ThreadId == threadId));
        }

        // The next sync sees the server-side result and keeps everything stable.
        var scope = _factory.Services.CreateScope();
        try
        {
            var ingestor = scope.ServiceProvider.GetRequiredService<MailIngestor>();
            await ingestor.SyncMailboxAsync(connectionId, CancellationToken.None);
        }
        finally
        {
            scope.Dispose();
        }

        await using (var db = _factory.NewDbContext())
        {
            Assert.True(await db.MailThreads.AnyAsync(t => t.Id == threadId));
            Assert.Equal(1, await db.MailMessages.CountAsync(m => m.ThreadId == threadId));
            Assert.Equal(1, await db.ThreadNotes.CountAsync(n => n.ThreadId == threadId));
            Assert.Equal(MailboxSyncState.Syncing,
                (await db.MailboxConnections.SingleAsync(c => c.Id == connectionId)).SyncState);
        }
    }

    [Fact]
    public async Task Move_partial_cancellation_keeps_confirmed_mapping()
    {
        var admin = await ApiFixture.RegisterAdminAsync(_factory);
        var (connectionId, threadId, _) = await ApiFixture.SeedThreadAsync(_factory, admin.UserId);
        await using (var seedDb = _factory.NewDbContext())
        {
            seedDb.MailboxFolders.AddRange(
                new MailboxFolder
                {
                    MailboxConnectionId = connectionId,
                    FullName = "Work",
                    UidValidity = 1,
                    SpecialUse = FolderSpecialUse.None
                },
                new MailboxFolder
                {
                    MailboxConnectionId = connectionId,
                    FullName = "Archive",
                    UidValidity = 1,
                    SpecialUse = FolderSpecialUse.Archive
                });
            await seedDb.SaveChangesAsync();
            var workId = await seedDb.MailboxFolders
                .Where(f => f.FullName == "Work").Select(f => f.Id).SingleAsync();
            seedDb.MailMessages.Add(new MailMessage
            {
                MailboxConnectionId = connectionId,
                FolderId = workId,
                ThreadId = threadId,
                Uid = 7,
                UidValidity = 1,
                MessageId = "<w@test.local>",
                Subject = "Test thread",
                FromAddr = "sender@example.com",
                MessageDate = DateTimeOffset.UtcNow
            });
            await seedDb.SaveChangesAsync();
        }
        _factory.Mail.Folder("INBOX").Messages[1] = new FakeMessageState { MessageId = "<i@test.local>" };
        _factory.Mail.Folder("Work").Messages[7] = new FakeMessageState { MessageId = "<w@test.local>" };
        _factory.Mail.Folder("Work").CancelOnMove = true;
        _factory.Mail.Folder("Archive");

        await Assert.ThrowsAsync<OperationCanceledException>(() =>
            Actions().MoveThreadAsync(threadId, admin.UserId, "Archive", CancellationToken.None));

        await using var db = _factory.NewDbContext();
        // Exactly one folder's confirmed mapping survives, whichever ran first.
        var archiveId = await db.MailboxFolders
            .Where(f => f.SpecialUse == FolderSpecialUse.Archive)
            .Select(f => f.Id).SingleAsync();
        var inArchive = await db.MailMessages.CountAsync(m => m.FolderId == archiveId);
        var total = await db.MailMessages.CountAsync(m => m.MailboxConnectionId == connectionId);
        Assert.Equal(2, total);
        Assert.True(inArchive is 0 or 1);
        Assert.True(await db.MailThreads.AnyAsync(t => t.Id == threadId));
    }

    [Fact]
    public async Task Trash_move_removes_rows_and_rebuilds()
    {
        var admin = await ApiFixture.RegisterAdminAsync(_factory);
        var (connectionId, threadId, _) = await ApiFixture.SeedThreadAsync(_factory, admin.UserId);
        await using (var seedDb = _factory.NewDbContext())
        {
            seedDb.MailboxFolders.Add(new MailboxFolder
            {
                MailboxConnectionId = connectionId,
                FullName = "Trash",
                UidValidity = 1,
                SpecialUse = FolderSpecialUse.Trash
            });
            await seedDb.SaveChangesAsync();
        }
        _factory.Mail.Folder("INBOX").Messages[1] = new FakeMessageState { MessageId = "m1" };
        _factory.Mail.Folder("Trash");

        await Actions().MoveThreadAsync(threadId, admin.UserId, "Trash", CancellationToken.None);

        await using var db = _factory.NewDbContext();
        Assert.Equal(0, await db.MailMessages.CountAsync(m => m.MailboxConnectionId == connectionId));
        Assert.Equal(0, await db.MailThreads.CountAsync(t => t.MailboxConnectionId == connectionId));
        Assert.Single(_factory.Mail.Moves);
    }

    [Fact]
    public async Task Fake_session_move_without_map_and_lookup()
    {
        var factory = new FakeMailSessionFactory();
        factory.Folder("INBOX").Messages[1] = new FakeMessageState { MessageId = "m" };
        factory.Folder("INBOX").NullMoveMap = true;
        factory.Folder("Archive");

        await using var session = await factory.ConnectAsync(null!, CancellationToken.None);
        Assert.NotNull(session);
        await using (var src = await session.OpenFolderAsync("INBOX", true, CancellationToken.None))
        {
            Assert.NotNull(src);
            var map = await src.MoveToAsync(new[] { 1u }, "Archive", CancellationToken.None);
            Assert.Null(map);
        }
        await using (var lookup = await session.OpenFolderAsync("Archive", true, CancellationToken.None))
        {
            Assert.Equal((uint)1, await lookup.FindUidByMessageIdAsync("m", CancellationToken.None));
        }
    }

    [Fact]
    public async Task Archive_move_refused_when_mapping_unsupported()
    {
        var admin = await ApiFixture.RegisterAdminAsync(_factory);
        var (connectionId, threadId, _) = await ApiFixture.SeedThreadAsync(_factory, admin.UserId);
        await using (var seedDb = _factory.NewDbContext())
        {
            seedDb.MailboxFolders.Add(new MailboxFolder
            {
                MailboxConnectionId = connectionId,
                FullName = "Archive",
                UidValidity = 1,
                SpecialUse = FolderSpecialUse.Archive
            });
            await seedDb.SaveChangesAsync();
        }
        _factory.Mail.SupportsMoveMapping = false;
        _factory.Mail.Folder("INBOX").Messages[1] = new FakeMessageState { MessageId = "m1" };
        _factory.Mail.Folder("Archive");

        try
        {
            var ex = await Assert.ThrowsAsync<InvalidOperationException>(() =>
                Actions().MoveThreadAsync(threadId, admin.UserId, "Archive", CancellationToken.None));
            Assert.Contains("report moved message", ex.Message);

            Assert.Empty(_factory.Mail.Moves);
            await using var db = _factory.NewDbContext();
            Assert.Equal(1, await db.MailMessages.CountAsync(m => m.ThreadId == threadId));
            Assert.True(await db.MailThreads.AnyAsync(t => t.Id == threadId));
        }
        finally
        {
            _factory.Mail.SupportsMoveMapping = true;
        }
    }

    [Fact]
    public async Task Unmapped_archive_reconciles_by_message_id()
    {
        var admin = await ApiFixture.RegisterAdminAsync(_factory);
        var (connectionId, threadId, _) = await ApiFixture.SeedThreadAsync(_factory, admin.UserId);
        await using (var seedDb = _factory.NewDbContext())
        {
            seedDb.MailboxFolders.Add(new MailboxFolder
            {
                MailboxConnectionId = connectionId,
                FullName = "Archive",
                UidValidity = 1,
                SpecialUse = FolderSpecialUse.Archive
            });
            await seedDb.SaveChangesAsync();
        }
        string messageId;
        await using (var seedDb = _factory.NewDbContext())
            messageId = (await seedDb.MailMessages.SingleAsync(m => m.ThreadId == threadId)).MessageId!;
        _factory.Mail.Folder("INBOX").Messages[1] = new FakeMessageState { MessageId = messageId };
        _factory.Mail.Folder("INBOX").NullMoveMap = true;
        _factory.Mail.Folder("Archive");

        await Actions().MoveThreadAsync(threadId, admin.UserId, "Archive", CancellationToken.None);

        await using var db = _factory.NewDbContext();
        // Reconciled by Message-ID instead of deleted: same thread, new folder.
        Assert.True(await db.MailThreads.AnyAsync(t => t.Id == threadId));
        var row = await db.MailMessages.SingleAsync(m => m.ThreadId == threadId);
        var archiveId = await db.MailboxFolders
            .Where(f => f.SpecialUse == FolderSpecialUse.Archive)
            .Select(f => f.Id).SingleAsync();
        Assert.Equal(archiveId, row.FolderId);
    }

    [Fact]
    public async Task Archive_move_refuses_stale_target_without_deleting_cache()
    {
        var admin = await ApiFixture.RegisterAdminAsync(_factory);
        var (connectionId, threadId, _) = await ApiFixture.SeedThreadAsync(_factory, admin.UserId);
        await using (var seedDb = _factory.NewDbContext())
        {
            var archive = new MailboxFolder
            {
                MailboxConnectionId = connectionId,
                FullName = "Archive",
                UidValidity = 1,
                SpecialUse = FolderSpecialUse.Archive
            };
            seedDb.MailboxFolders.Add(archive);
            await seedDb.SaveChangesAsync();
            seedDb.MailMessages.Add(new MailMessage
            {
                MailboxConnectionId = connectionId,
                FolderId = archive.Id,
                ThreadId = null,
                Uid = 3,
                UidValidity = 1,
                MessageId = "<stale@test.local>",
                Subject = "Stale",
                FromAddr = "sender@example.com",
                MessageDate = DateTimeOffset.UtcNow
            });
            await seedDb.SaveChangesAsync();
        }
        _factory.Mail.Folder("INBOX").Messages[1] = new FakeMessageState { MessageId = "<m@test.local>" };
        var archiveState = _factory.Mail.Folder("Archive");
        archiveState.UidValidity = 2;

        await Assert.ThrowsAsync<InvalidOperationException>(() =>
            Actions().MoveThreadAsync(threadId, admin.UserId, "Archive", CancellationToken.None));

        await using var db = _factory.NewDbContext();
        var rows = await db.MailMessages.Where(m => m.MailboxConnectionId == connectionId).ToListAsync();
        Assert.Equal(2, rows.Count);
        Assert.All(rows, row => Assert.Equal((uint)1, row.UidValidity));
        Assert.Empty(_factory.Mail.Moves);
        Assert.Equal((uint)1,
            (await db.MailboxFolders.SingleAsync(f => f.SpecialUse == FolderSpecialUse.Archive)).UidValidity);
    }
}
