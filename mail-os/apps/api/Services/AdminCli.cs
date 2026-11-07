using Kompanion.Api.Data;
using Kompanion.Api.Services.Mail;
using Microsoft.EntityFrameworkCore;

namespace Kompanion.Api.Services;

/// <summary>
/// Maintenance commands run against the same configuration and database as the API,
/// instead of hand-written SQL against a live deployment.
///
/// Usage:
///   dotnet run --project apps/api -- reset-password &lt;email-or-username&gt;
///   dotnet run --project apps/api -- list-users
/// </summary>
public static class AdminCli
{
    /// <summary>
    /// Runs a maintenance command if one was requested. Returns true when the process
    /// should exit rather than start the web host. <paramref name="exitCode"/> is 0 on
    /// success, 1 on failure, so shell scripts can branch on it.
    /// </summary>
    public static async Task<(bool Handled, int ExitCode)> TryRunAsync(WebApplication app, string[] args)
    {
        var command = args.FirstOrDefault();
        if (string.IsNullOrWhiteSpace(command) || command.StartsWith('-'))
            return (false, 0);

        switch (command.ToLowerInvariant())
        {
            case "reset-password":
                return (true, await ResetPasswordAsync(app, args.Skip(1).FirstOrDefault()));
            case "list-users":
                return (true, await ListUsersAsync(app));
            case "rebuild-snippets":
                return (true, await RebuildSnippetsAsync(app));
            case "backfill-attachments":
                return (true, await BackfillAttachmentsAsync(app));
            case "seed-templates":
                return (true, await SeedTemplatesAsync(app, args.Skip(1).ToArray()));
            case "import-kca-concepts":
                return (true, await ImportKcaConceptsAsync(app, args.Skip(1).ToArray()));
            case "refresh-brand-kit":
                return (true, await RefreshBrandKitAsync(app));
            case "help" or "--help":
                PrintUsage();
                return (true, 0);
            default:
                Console.Error.WriteLine($"Unknown command '{command}'.");
                PrintUsage();
                return (true, 1);
        }
    }

    private static void PrintUsage()
    {
        Console.WriteLine("""
            Kompanion — maintenance commands

              reset-password <email-or-username>   Generate a new password for an account
              list-users                           Show every account and its role
              rebuild-snippets                     Regenerate inbox previews from stored bodies
              backfill-attachments                 Re-fetch attachments for older messages
              seed-templates [--replace]           Install the starter template library
              import-kca-concepts --org-id <id> [--dry-run]  Add missing KCA designs, preserving saved work
              refresh-brand-kit                    Regenerate the email letterhead
              help                                 Show this message

            Run with no command to start the API normally.
            """);
    }

    private static async Task<int> ResetPasswordAsync(WebApplication app, string? identifier)
    {
        if (string.IsNullOrWhiteSpace(identifier))
        {
            Console.Error.WriteLine("Usage: reset-password <email-or-username>");
            return 1;
        }

        using var scope = app.Services.CreateScope();
        var resets = scope.ServiceProvider.GetRequiredService<PasswordResetService>();
        var result = await resets.ResetAsync(identifier);

        if (!result.Found)
        {
            Console.Error.WriteLine($"No account matches '{identifier}'. Try `list-users`.");
            return 1;
        }

        Console.WriteLine();
        Console.WriteLine($"  Account:      {result.Email}");
        Console.WriteLine($"  Display name: {result.DisplayName}");
        Console.WriteLine($"  Role:         {result.Role}");
        Console.WriteLine();
        Console.WriteLine($"  New password: {result.NewPassword}");
        Console.WriteLine();
        Console.WriteLine("  Shown once — it is stored only as a hash. Sign in and change it");
        Console.WriteLine("  under Settings > Profile. All other sessions for this account");
        Console.WriteLine("  have been signed out.");
        Console.WriteLine();
        return 0;
    }

    /// <summary>
    /// Recomputes every message's preview line from the body already in the database.
    ///
    /// Snippets are written once at ingest, so the fix for HTML-only mail (which used to
    /// leave &lt;style&gt; contents in the preview) only helped messages synced afterwards.
    /// Re-syncing would not repair them either: ingest skips UIDs it has already seen.
    /// No network involved — this reads and rewrites local rows.
    /// </summary>
    private static async Task<int> RebuildSnippetsAsync(WebApplication app)
    {
        using var scope = app.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        var total = await db.MailMessages.CountAsync();
        if (total == 0)
        {
            Console.WriteLine("No messages to rebuild.");
            return 0;
        }

        Console.WriteLine($"Rebuilding previews for {total} message(s)…");

        var changed = 0;
        var scanned = 0;
        const int BatchSize = 500;

        // Paged by primary key rather than Skip/Take: the set is stable here, but keyset
        // paging keeps memory flat and avoids re-scanning on every batch.
        long cursor = 0;
        while (true)
        {
            var batch = await db.MailMessages
                .Where(m => m.Id > cursor)
                .OrderBy(m => m.Id)
                .Take(BatchSize)
                .Select(m => new { m.Id, m.BodyText, m.BodyHtml, m.Snippet })
                .ToListAsync();

            if (batch.Count == 0) break;
            cursor = batch[^1].Id;
            scanned += batch.Count;

            foreach (var row in batch)
            {
                var rebuilt = MailIngestor.BuildSnippet(row.BodyText, row.BodyHtml);
                if (rebuilt == row.Snippet) continue;

                var id = row.Id;
                await db.MailMessages
                    .Where(m => m.Id == id)
                    .ExecuteUpdateAsync(s => s.SetProperty(m => m.Snippet, rebuilt));
                changed++;
            }

            Console.Write($"\r  scanned {scanned}/{total}, rewritten {changed}   ");
        }

        Console.WriteLine();

        // Thread snippets are denormalised copies of the latest message's preview, so
        // they need the same treatment or the list keeps showing the stale text.
        var threadsFixed = 0;
        var threads = await db.MailThreads.Select(t => new { t.Id, t.Snippet }).ToListAsync();
        foreach (var thread in threads)
        {
            var latest = await db.MailMessages
                .Where(m => m.ThreadId == thread.Id)
                .OrderByDescending(m => m.MessageDate ?? m.InternalDate)
                .Select(m => m.Snippet)
                .FirstOrDefaultAsync();

            if (latest == thread.Snippet) continue;

            var id = thread.Id;
            await db.MailThreads
                .Where(t => t.Id == id)
                .ExecuteUpdateAsync(s => s.SetProperty(t => t.Snippet, latest));
            threadsFixed++;
        }

        Console.WriteLine($"Done. {changed} message preview(s) and {threadsFixed} thread preview(s) updated.");
        return 0;
    }

    /// <summary>
    /// Re-fetches attachment bytes for messages that were synced before the blob store
    /// existed. Those rows carry HasAttachments and the filename metadata but have no
    /// stored content, so the list promises a paperclip the reader cannot open.
    ///
    /// Unlike rebuild-snippets this needs the network: the bytes were never kept, so
    /// they have to come back from IMAP by UID. Refetching sets \Seen on this Dovecot
    /// host, so the original flags are restored afterwards, exactly as the sync does.
    /// </summary>
    private static async Task<int> BackfillAttachmentsAsync(WebApplication app)
    {
        using var scope = app.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var ingestor = scope.ServiceProvider.GetRequiredService<MailIngestor>();

        var pending = await db.MailMessages
            .Where(m => m.HasAttachments && !m.Attachments.Any())
            .Select(m => new { m.Id, m.MailboxConnectionId, m.Subject })
            .ToListAsync();

        if (pending.Count == 0)
        {
            Console.WriteLine("Nothing to backfill — every message with attachments already has them stored.");
            return 0;
        }

        var mailboxes = pending.Select(m => m.MailboxConnectionId).Distinct().ToList();
        Console.WriteLine(
            $"{pending.Count} message(s) across {mailboxes.Count} mailbox(es) are missing attachment content.");
        Console.WriteLine("Re-fetching from the mail server…");
        Console.WriteLine();

        var stored = 0;
        var failed = 0;
        foreach (var connectionId in mailboxes)
        {
            try
            {
                var result = await ingestor.BackfillAttachmentsAsync(connectionId, CancellationToken.None);
                stored += result.Stored;
                failed += result.Failed;
                Console.WriteLine($"  {result.Mailbox}: {result.Stored} stored, {result.Failed} failed");
            }
            catch (Exception ex)
            {
                failed++;
                Console.Error.WriteLine($"  mailbox {connectionId}: {ex.Message}");
            }
        }

        Console.WriteLine();
        Console.WriteLine($"Done. {stored} attachment(s) stored, {failed} message(s) could not be fetched.");
        return failed > 0 && stored == 0 ? 1 : 0;
    }

    /// <summary>
    /// Adds missing KCA concepts for one explicitly selected company, preserving saved work.
    /// </summary>
    private static async Task<int> ImportKcaConceptsAsync(WebApplication app, string[] args)
    {
        if (args.Length is < 2 or > 3 || args[0] != "--org-id"
            || !int.TryParse(args[1], out var orgId) || orgId <= 0
            || (args.Length == 3 && args[2] != "--dry-run"))
        {
            Console.Error.WriteLine("Usage: import-kca-concepts --org-id <id> [--dry-run]");
            return 1;
        }

        using var scope = app.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        try
        {
            var result = await KcaConceptTemplates.ImportAsync(db, orgId, args.Contains("--dry-run"));
            Console.WriteLine($"{(result.DryRun ? "Dry run" : "Import complete")}: {result.Added} {(result.DryRun ? "would be added" : "added")}, {result.Skipped} preserved, organisation {orgId}.");
            return 0;
        }
        catch (ArgumentException e)
        {
            Console.Error.WriteLine(e.Message);
            return 1;
        }
    }

    /// <summary>Installs or updates the original starter library by name.</summary>
    private static async Task<int> SeedTemplatesAsync(WebApplication app, string[] args)
    {
        var replace = args.Contains("--replace", StringComparer.OrdinalIgnoreCase);

        using var scope = app.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        var orgIds = await db.Organizations.Select(o => o.Id).ToListAsync();
        if (orgIds.Count == 0)
        {
            Console.Error.WriteLine("No organisations yet — register an account first.");
            return 1;
        }

        var libraryNames = StarterTemplates.All.Select(t => t.Name).ToHashSet(StringComparer.OrdinalIgnoreCase);
        int added = 0, updated = 0, removed = 0;

        foreach (var orgId in orgIds)
        {
            var existing = await db.EmailTemplates.Where(t => t.OrganizationId == orgId).ToListAsync();

            foreach (var def in StarterTemplates.All)
            {
                // Several rows can share a name — the seed itself is what collapses
                // them, so take the first and let the rest fall to --replace.
                var row = existing.FirstOrDefault(t => string.Equals(t.Name, def.Name, StringComparison.OrdinalIgnoreCase));
                if (row is null)
                {
                    row = new EmailTemplate { OrganizationId = orgId, Name = def.Name, CreatedAt = DateTimeOffset.UtcNow };
                    db.EmailTemplates.Add(row);
                    added++;
                }
                else
                {
                    existing.Remove(row);
                    updated++;
                }

                row.Description = def.Description;
                row.Subject = def.Subject;
                row.BodyHtml = def.BodyHtml;
                row.VariablesJson = System.Text.Json.JsonSerializer.Serialize(def.Variables);
                // Most sit inside the brand kit's chrome; the self-branded one carries
                // its own and says so.
                row.SkipBrandWrap = def.SkipBrandWrap;
                row.UpdatedAt = DateTimeOffset.UtcNow;
            }

            if (replace)
            {
                var strays = existing.Where(t => !libraryNames.Contains(t.Name)).ToList();
                // Anything left in `existing` with a library name is a duplicate row.
                var duplicates = existing.Where(t => libraryNames.Contains(t.Name)).ToList();
                foreach (var t in strays.Concat(duplicates))
                {
                    Console.WriteLine($"  removing: {t.Name} (org {orgId})");
                    db.EmailTemplates.Remove(t);
                    removed++;
                }
            }
        }

        await db.SaveChangesAsync();

        Console.WriteLine();
        Console.WriteLine($"Done. {added} added, {updated} updated, {removed} removed across {orgIds.Count} organisation(s).");
        if (!replace && removed == 0)
            Console.WriteLine("Run with --replace to also clear templates outside the starter library.");
        return 0;
    }

    /// <summary>
    /// Rewrites each organisation's email letterhead from the current defaults and
    /// the kit's own colours.
    ///
    /// Only the header is touched — signature and footer are left alone, since those
    /// carry contact details somebody has typed. The old value is printed before it
    /// goes, because a header that was customised by hand is not recoverable from
    /// here afterwards.
    /// </summary>
    private static async Task<int> RefreshBrandKitAsync(WebApplication app)
    {
        using var scope = app.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        var kits = await db.BrandKits.ToListAsync();
        if (kits.Count == 0)
        {
            Console.WriteLine("No brand kits yet — one is created the first time a template is previewed.");
            return 0;
        }

        var names = await db.Organizations.ToDictionaryAsync(o => o.Id, o => o.Name);

        foreach (var kit in kits)
        {
            var orgName = names.TryGetValue(kit.OrganizationId, out var n) ? n : "Your company";
            Console.WriteLine($"org {kit.OrganizationId} ({orgName})");
            Console.WriteLine($"  was: {Summarise(kit.HeaderHtml)}");

            kit.HeaderHtml = BrandKitDefaults.HeaderHtml(orgName, kit.PrimaryColor, kit.TextColor);
            kit.UpdatedAt = DateTimeOffset.UtcNow;

            Console.WriteLine($"  now: {Summarise(kit.HeaderHtml)}");
        }

        await db.SaveChangesAsync();
        Console.WriteLine();
        Console.WriteLine($"Done. {kits.Count} letterhead(s) regenerated. Edit further in Settings → Brand kit.");
        return 0;

        static string Summarise(string? html)
        {
            if (string.IsNullOrWhiteSpace(html)) return "(empty)";
            var text = System.Text.RegularExpressions.Regex.Replace(html, "<[^>]+>", " ");
            text = System.Text.RegularExpressions.Regex.Replace(text, @"\s+", " ").Trim();
            return text.Length > 70 ? text[..70] + "…" : text;
        }
    }

    private static async Task<int> ListUsersAsync(WebApplication app)
    {
        using var scope = app.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        var users = await db.Users
            .OrderBy(u => u.OrganizationId).ThenBy(u => u.CreatedAt)
            .Select(u => new { u.Email, u.Username, u.DisplayName, u.Role, u.LastLoginAt })
            .ToListAsync();

        if (users.Count == 0)
        {
            Console.WriteLine("No accounts yet — register at /register to bootstrap the admin.");
            return 0;
        }

        Console.WriteLine();
        Console.WriteLine($"  {"EMAIL",-34} {"USERNAME",-18} {"DISPLAY NAME",-18} {"ROLE",-7} LAST LOGIN");
        foreach (var u in users)
        {
            var lastLogin = u.LastLoginAt?.ToString("yyyy-MM-dd HH:mm") ?? "never";
            Console.WriteLine(
                $"  {u.Email,-34} {"@" + u.Username,-18} {u.DisplayName,-18} {u.Role,-7} {lastLogin}");
        }
        Console.WriteLine();
        return 0;
    }
}
