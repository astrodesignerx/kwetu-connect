using Kompanion.Api.Data;
using Kompanion.Api.Services.Mail;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace Kompanion.Api.Tests;

/// <summary>
/// Sync reconciles local rows against a complete server UID set (including empty
/// folders), never deletes on failed fetches, and reports failures honestly.
/// </summary>
public sealed class MailSyncTests : IAsyncLifetime
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

    private MailIngestor Ingestor()
    {
        var scope = _factory.Services.CreateScope();
        _scopes.Add(scope);
        return scope.ServiceProvider.GetRequiredService<MailIngestor>();
    }

    [Fact]
    public async Task Empty_folder_reconciles_local_rows_away()
    {
        var admin = await ApiFixture.RegisterAdminAsync(_factory);
        var (connectionId, threadId, _) = await ApiFixture.SeedThreadAsync(_factory, admin.UserId);
        _factory.Mail.Folder("INBOX"); // server folder exists but is empty

        await Ingestor().SyncMailboxAsync(connectionId, CancellationToken.None);

        await using var db = _factory.NewDbContext();
        Assert.Equal(0, await db.MailMessages.CountAsync(m => m.MailboxConnectionId == connectionId));
        Assert.Equal(0, await db.MailThreads.CountAsync(t => t.MailboxConnectionId == connectionId));
        var connection = await db.MailboxConnections.SingleAsync(c => c.Id == connectionId);
        Assert.Equal(MailboxSyncState.Syncing, connection.SyncState);
        Assert.Null(connection.SyncError);
        Assert.NotNull(connection.LastSyncCompletedAt);
    }

    [Fact]
    public async Task Folder_failure_sets_error_state_not_false_success()
    {
        var admin = await ApiFixture.RegisterAdminAsync(_factory);
        var (connectionId, _, _) = await ApiFixture.SeedThreadAsync(_factory, admin.UserId);
        _factory.Mail.Folder("INBOX").FailOpen = true;

        await Ingestor().SyncMailboxAsync(connectionId, CancellationToken.None);

        await using var db = _factory.NewDbContext();
        var connection = await db.MailboxConnections.SingleAsync(c => c.Id == connectionId);
        Assert.Equal(MailboxSyncState.Error, connection.SyncState);
        Assert.Contains("INBOX", connection.SyncError);
        Assert.Null(connection.LastSyncCompletedAt);
        // The seeded row was not deleted on a failed fetch.
        Assert.Equal(1, await db.MailMessages.CountAsync(m => m.MailboxConnectionId == connectionId));
    }

    [Fact]
    public async Task New_messages_ingest_and_unread_state_is_restored()
    {
        var admin = await ApiFixture.RegisterAdminAsync(_factory);
        var (connectionId, _, _) = await ApiFixture.SeedThreadAsync(_factory, admin.UserId);
        await using (var seedDb = _factory.NewDbContext())
        {
            // The seeded row belongs to a message the server no longer has.
            await seedDb.MailMessages.ExecuteDeleteAsync();
            await seedDb.MailThreads.ExecuteDeleteAsync();
        }
        _factory.Mail.Folder("INBOX").Messages[5] = new FakeMessageState
        {
            MessageId = "<new@test.local>",
            Seen = false,
            BuildMime = () => FakeMailSessionFactory.BuildMime("<new@test.local>", "Fresh mail", "sender@example.com")
        };

        await Ingestor().SyncMailboxAsync(connectionId, CancellationToken.None);

        await using var db = _factory.NewDbContext();
        var row = await db.MailMessages.SingleAsync(m => m.MailboxConnectionId == connectionId);
        Assert.Equal((uint)5, row.Uid);
        Assert.DoesNotContain("Seen", row.Flags);
        // Fetching the body marked it read on the server; the sync restored unread.
        Assert.False(_factory.Mail.Folder("INBOX").Messages[5].Seen);
        var connection = await db.MailboxConnections.SingleAsync(c => c.Id == connectionId);
        Assert.Equal(MailboxSyncState.Syncing, connection.SyncState);
    }

    [Fact]
    public async Task Uidvalidity_change_resyncs_the_folder()
    {
        var admin = await ApiFixture.RegisterAdminAsync(_factory);
        var (connectionId, _, _) = await ApiFixture.SeedThreadAsync(_factory, admin.UserId);
        var server = _factory.Mail.Folder("INBOX");
        server.UidValidity = 2;
        server.Messages[9] = new FakeMessageState
        {
            MessageId = "<rotated@test.local>",
            Seen = true,
            BuildMime = () => FakeMailSessionFactory.BuildMime("<rotated@test.local>", "Rotated", "sender@example.com")
        };

        await Ingestor().SyncMailboxAsync(connectionId, CancellationToken.None);

        await using var db = _factory.NewDbContext();
        var row = await db.MailMessages.SingleAsync(m => m.MailboxConnectionId == connectionId);
        Assert.Equal((uint)9, row.Uid);
        Assert.Equal((uint)2, row.UidValidity);
        var folder = await db.MailboxFolders.SingleAsync(f => f.MailboxConnectionId == connectionId);
        Assert.Equal((uint)2, folder.UidValidity);
    }

    [Fact]
    public async Task Validity_change_plus_failed_search_deletes_nothing()
    {
        var admin = await ApiFixture.RegisterAdminAsync(_factory);
        var (connectionId, _, _) = await ApiFixture.SeedThreadAsync(_factory, admin.UserId);
        var server = _factory.Mail.Folder("INBOX");
        server.UidValidity = 2;
        server.FailSearch = true;

        await Ingestor().SyncMailboxAsync(connectionId, CancellationToken.None);

        await using var db = _factory.NewDbContext();
        // The snapshot never completed, so the stale rows survive untouched.
        var row = await db.MailMessages.SingleAsync(m => m.MailboxConnectionId == connectionId);
        Assert.Equal((uint)1, row.Uid);
        Assert.Equal((uint)1, row.UidValidity);
        var connection = await db.MailboxConnections.SingleAsync(c => c.Id == connectionId);
        Assert.Equal(MailboxSyncState.Error, connection.SyncState);
        Assert.Contains("INBOX", connection.SyncError);
    }

    [Fact]
    public async Task Partial_fetch_summary_is_an_honest_error()
    {
        var admin = await ApiFixture.RegisterAdminAsync(_factory);
        var (connectionId, _, _) = await ApiFixture.SeedThreadAsync(_factory, admin.UserId);
        await using (var seedDb = _factory.NewDbContext())
        {
            await seedDb.MailMessages.ExecuteDeleteAsync();
            await seedDb.MailThreads.ExecuteDeleteAsync();
        }
        var server = _factory.Mail.Folder("INBOX");
        server.Messages[5] = new FakeMessageState
        {
            MessageId = "<a@test.local>",
            BuildMime = () => FakeMailSessionFactory.BuildMime("<a@test.local>", "A", "sender@example.com")
        };
        server.Messages[6] = new FakeMessageState
        {
            MessageId = "<b@test.local>",
            BuildMime = () => FakeMailSessionFactory.BuildMime("<b@test.local>", "B", "sender@example.com")
        };
        server.DropSummaries.Add(6);

        await Ingestor().SyncMailboxAsync(connectionId, CancellationToken.None);

        await using var db = _factory.NewDbContext();
        var connection = await db.MailboxConnections.SingleAsync(c => c.Id == connectionId);
        Assert.Equal(MailboxSyncState.Error, connection.SyncState);
        Assert.Contains("INBOX", connection.SyncError);
    }

    [Fact]
    public async Task Failed_body_fetch_is_an_honest_error()
    {
        var admin = await ApiFixture.RegisterAdminAsync(_factory);
        var (connectionId, _, _) = await ApiFixture.SeedThreadAsync(_factory, admin.UserId);
        await using (var seedDb = _factory.NewDbContext())
        {
            await seedDb.MailMessages.ExecuteDeleteAsync();
            await seedDb.MailThreads.ExecuteDeleteAsync();
        }
        var server = _factory.Mail.Folder("INBOX");
        server.Messages[5] = new FakeMessageState
        {
            MessageId = "<broken@test.local>",
            BuildMime = () => FakeMailSessionFactory.BuildMime("<broken@test.local>", "Broken", "sender@example.com")
        };
        server.FailGetUids.Add(5);

        await Ingestor().SyncMailboxAsync(connectionId, CancellationToken.None);

        await using var db = _factory.NewDbContext();
        var connection = await db.MailboxConnections.SingleAsync(c => c.Id == connectionId);
        Assert.Equal(MailboxSyncState.Error, connection.SyncState);
        Assert.Contains("INBOX", connection.SyncError);
        Assert.Equal(0, await db.MailMessages.CountAsync(m => m.MailboxConnectionId == connectionId));
    }

    [Fact]
    public async Task Cancellation_after_body_seen_restores_unread_and_records_error()
    {
        var admin = await ApiFixture.RegisterAdminAsync(_factory);
        var (connectionId, _, _) = await ApiFixture.SeedThreadAsync(_factory, admin.UserId);
        await using (var seedDb = _factory.NewDbContext())
        {
            await seedDb.MailMessages.ExecuteDeleteAsync();
            await seedDb.MailThreads.ExecuteDeleteAsync();
        }
        var server = _factory.Mail.Folder("INBOX");
        server.Messages[5] = new FakeMessageState
        {
            MessageId = "<first@test.local>",
            Seen = false,
            BuildMime = () => FakeMailSessionFactory.BuildMime("<first@test.local>", "First", "sender@example.com")
        };
        server.Messages[6] = new FakeMessageState
        {
            MessageId = "<second@test.local>",
            Seen = false,
            BuildMime = () => FakeMailSessionFactory.BuildMime("<second@test.local>", "Second", "sender@example.com")
        };
        server.CancelGetUids.Add(6);

        var ex = await Assert.ThrowsAsync<OperationCanceledException>(() =>
            Ingestor().SyncMailboxAsync(connectionId, CancellationToken.None));

        // The first body fetch marked it read on the server; the finally-restore
        // put it back even though the folder was cancelled.
        Assert.False(server.Messages[5].Seen);
        await using var db = _factory.NewDbContext();
        var connection = await db.MailboxConnections.SingleAsync(c => c.Id == connectionId);
        Assert.Equal(MailboxSyncState.Error, connection.SyncState);
        Assert.Contains("cancel", connection.SyncError, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task List_failure_is_an_honest_error()
    {
        var admin = await ApiFixture.RegisterAdminAsync(_factory);
        var (connectionId, _, _) = await ApiFixture.SeedThreadAsync(_factory, admin.UserId);
        _factory.Mail.FailListFolders = true;

        try
        {
            await Ingestor().SyncMailboxAsync(connectionId, CancellationToken.None);

            await using var db = _factory.NewDbContext();
            var connection = await db.MailboxConnections.SingleAsync(c => c.Id == connectionId);
            Assert.Equal(MailboxSyncState.Error, connection.SyncState);
            Assert.Contains("folder", connection.SyncError, StringComparison.OrdinalIgnoreCase);
            Assert.Equal(1, await db.MailMessages.CountAsync(m => m.MailboxConnectionId == connectionId));
        }
        finally
        {
            _factory.Mail.FailListFolders = false;
        }
    }

    [Fact]
    public async Task Validity_reset_with_body_failure_retains_prior_cache()
    {
        var admin = await ApiFixture.RegisterAdminAsync(_factory);
        var (connectionId, _, _) = await ApiFixture.SeedThreadAsync(_factory, admin.UserId);
        var server = _factory.Mail.Folder("INBOX");
        server.UidValidity = 2;
        server.Messages[9] = new FakeMessageState
        {
            MessageId = "<replacement@test.local>",
            Seen = true,
            BuildMime = () => FakeMailSessionFactory.BuildMime("<replacement@test.local>", "Replacement", "sender@example.com")
        };
        server.FailGetMessage = true;

        await Ingestor().SyncMailboxAsync(connectionId, CancellationToken.None);

        await using var db = _factory.NewDbContext();
        // The replacement failed: the prior cache, thread and folder generation
        // are all intact, with an honest error instead of a half reset.
        var row = await db.MailMessages.SingleAsync(m => m.MailboxConnectionId == connectionId);
        Assert.Equal((uint)1, row.Uid);
        Assert.Equal((uint)1, row.UidValidity);
        Assert.Equal(1, await db.MailThreads.CountAsync(t => t.MailboxConnectionId == connectionId));
        Assert.Equal((uint)1,
            (await db.MailboxFolders.SingleAsync(f => f.MailboxConnectionId == connectionId)).UidValidity);
        var connection = await db.MailboxConnections.SingleAsync(c => c.Id == connectionId);
        Assert.Equal(MailboxSyncState.Error, connection.SyncState);
    }

    [Fact]
    public async Task Partial_move_sync_keeps_thread_metadata_until_destination_recovers()
    {
        var admin = await ApiFixture.RegisterAdminAsync(_factory);
        var (connectionId, threadId, _) = await ApiFixture.SeedThreadAsync(_factory, admin.UserId);
        var source = _factory.Mail.Folder("INBOX");
        source.Messages.Clear();
        var destination = _factory.Mail.Folder("Archive");
        destination.Messages[8] = new FakeMessageState
        {
            MessageId = "<m@test.local>",
            BuildMime = () => FakeMailSessionFactory.BuildMime("<m@test.local>", "Moved", "sender@example.com")
        };
        destination.FailGetMessage = true;

        await Ingestor().SyncMailboxAsync(connectionId, CancellationToken.None);

        await using var db = _factory.NewDbContext();
        Assert.True(await db.MailThreads.AnyAsync(t => t.Id == threadId));
        Assert.Equal(MailboxSyncState.Error,
            (await db.MailboxConnections.SingleAsync(c => c.Id == connectionId)).SyncState);
    }

    [Fact]
    public async Task Restore_failure_is_an_honest_error()
    {
        var admin = await ApiFixture.RegisterAdminAsync(_factory);
        var (connectionId, _, _) = await ApiFixture.SeedThreadAsync(_factory, admin.UserId);
        await using (var seedDb = _factory.NewDbContext())
        {
            await seedDb.MailMessages.ExecuteDeleteAsync();
            await seedDb.MailThreads.ExecuteDeleteAsync();
        }
        var server = _factory.Mail.Folder("INBOX");
        server.Messages[5] = new FakeMessageState
        {
            MessageId = "<restore@test.local>",
            Seen = false,
            BuildMime = () => FakeMailSessionFactory.BuildMime("<restore@test.local>", "Restore", "sender@example.com")
        };
        server.FailSetSeen = true;

        await Ingestor().SyncMailboxAsync(connectionId, CancellationToken.None);

        await using var db = _factory.NewDbContext();
        var connection = await db.MailboxConnections.SingleAsync(c => c.Id == connectionId);
        Assert.Equal(MailboxSyncState.Error, connection.SyncState);
        Assert.Contains("unread", connection.SyncError, StringComparison.OrdinalIgnoreCase);
    }
}
