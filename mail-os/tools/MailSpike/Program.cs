using System.Text;
using MailSpike;

Console.OutputEncoding = Encoding.UTF8;

var command = args.FirstOrDefault() ?? "sync";
var cfg = SpikeConfig.Load();

if (string.IsNullOrWhiteSpace(cfg.Email) || string.IsNullOrWhiteSpace(cfg.Password))
{
    Console.Error.WriteLine("Missing mailbox credentials.");
    Console.Error.WriteLine("Create tools/MailSpike/spike.local.env (gitignored) containing:");
    Console.Error.WriteLine("  MAILSPIKE_EMAIL=creatives@kwetuconnectads.co.ke");
    Console.Error.WriteLine("  MAILSPIKE_PASSWORD=<your mailbox password>");
    return 2;
}

if (command is "seed")
{
    await SeedData.RunAsync(cfg);
    return 0;
}

if (command is "seed-clean")
{
    await SeedData.CleanAsync(cfg);
    return 0;
}

var schemaPath = RepoPaths.Find(Path.Combine("infra", "schema.sql"))
    ?? throw new FileNotFoundException("infra/schema.sql not found — run from the repo root.");

var db = new Db(cfg.PgConnection);
await db.EnsureSchemaAsync(schemaPath);
var mailboxId = await db.UpsertMailboxAsync(cfg.Email, cfg.ImapHost);
Console.WriteLine($"Mailbox '{cfg.Email}' -> mailbox id {mailboxId}");

if (command is "sync")
{
    Console.WriteLine($"Syncing last {cfg.Days} days from {cfg.ImapHost}:{cfg.ImapPort} ...");
    await new MailIngestor(cfg).RunAsync(db, mailboxId);
}

if (command is "sync" or "threads")
{
    var inputs = await db.LoadMessagesAsync(mailboxId);
    var threads = ThreadBuilder.BuildThreads(inputs);
    await db.ReplaceThreadsAsync(mailboxId, threads);
    Console.WriteLine($"Threading complete: {inputs.Count} messages -> {threads.Count} threads " +
                      $"({threads.Count(t => t.MemberDbIds.Count > 1)} multi-message).");
}

await Verifier.PrintAsync(db, mailboxId);
return 0;
