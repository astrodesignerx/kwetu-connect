using System.Security.Cryptography;

namespace Kompanion.Api.Services.Mail;

public class AttachmentStoreOptions
{
    /// <summary>Root directory for the blob store. Relative paths resolve against the content root.</summary>
    public string Path { get; set; } = "";

    /// <summary>Rejected above this size, per file. Exim on the mail host caps around 50 MB.</summary>
    public long MaxBytes { get; set; } = 25 * 1024 * 1024;
}

/// <summary>
/// Content-addressed blob store for attachment bytes.
///
/// Files are keyed by the SHA-256 of their content and written to a two-level sharded
/// path (<c>ab/cd/abcd…</c>) so no single directory accumulates hundreds of thousands
/// of entries. Because the key is the hash, storing the same file twice is a no-op —
/// a 4 MB logo on every message in a 500-message thread costs 4 MB, not 2 GB.
///
/// Kept out of Postgres deliberately: mailbox sync is full-history, and blobs in the
/// database would land in every pg_dump and slow every restore.
/// </summary>
public class AttachmentStore
{
    private readonly string _root;
    private readonly ILogger<AttachmentStore> _logger;

    public long MaxBytes { get; }

    public AttachmentStore(IConfiguration config, IHostEnvironment env, ILogger<AttachmentStore> logger)
    {
        _logger = logger;
        var options = config.GetSection("Attachments").Get<AttachmentStoreOptions>() ?? new AttachmentStoreOptions();
        MaxBytes = options.MaxBytes > 0 ? options.MaxBytes : 25 * 1024 * 1024;

        var configured = string.IsNullOrWhiteSpace(options.Path)
            ? System.IO.Path.Combine(env.ContentRootPath, "..", "..", "infra", "attachments")
            : options.Path;
        _root = System.IO.Path.GetFullPath(configured);
        Directory.CreateDirectory(_root);
    }

    /// <summary>
    /// Streams <paramref name="content"/> into the store and returns its key and size.
    /// Writes to a temp file first, then moves into place, so a crash mid-write can
    /// never leave a truncated blob under a hash that claims to be complete.
    /// </summary>
    public async Task<(string BlobKey, long SizeBytes)> SaveAsync(Stream content, CancellationToken ct)
    {
        Directory.CreateDirectory(_root);
        var temp = System.IO.Path.Combine(_root, $".tmp-{Guid.NewGuid():N}");

        string hashHex;
        long size;
        try
        {
            await using (var file = File.Create(temp))
            using (var sha = SHA256.Create())
            using (var hashing = new CryptoStream(file, sha, CryptoStreamMode.Write))
            {
                await content.CopyToAsync(hashing, ct);
                await hashing.FlushFinalBlockAsync(ct);
                size = file.Length;
                hashHex = Convert.ToHexString(sha.Hash!).ToLowerInvariant();
            }

            var target = PathForKey(hashHex);
            Directory.CreateDirectory(System.IO.Path.GetDirectoryName(target)!);

            if (File.Exists(target))
            {
                // Identical content already stored — drop the duplicate.
                File.Delete(temp);
            }
            else
            {
                File.Move(temp, target);
            }
        }
        catch
        {
            TryDelete(temp);
            throw;
        }

        return (hashHex, size);
    }

    public bool Exists(string blobKey) => File.Exists(PathForKey(blobKey));

    /// <summary>Opens a blob for reading, or null if it is missing from the store.</summary>
    public Stream? OpenRead(string blobKey)
    {
        var path = PathForKey(blobKey);
        if (!File.Exists(path))
        {
            _logger.LogWarning("Attachment blob {Key} is recorded in the database but missing on disk", blobKey);
            return null;
        }
        return File.OpenRead(path);
    }

    /// <summary>
    /// Deletes every blob whose key is not in <paramref name="liveKeys"/> and returns
    /// how many were removed. Called only from the nightly sweep — blobs are shared
    /// between rows, so they can never be deleted when an individual row goes away.
    ///
    /// <paramref name="minAge"/> guards the window between writing a blob and committing
    /// the row that references it: ingest stages up to 100 messages' attachments before
    /// its first <c>SaveChangesAsync</c>, and an upload writes the blob before inserting
    /// its row. A sweep running in that window would see a live blob as unreferenced and
    /// delete it, leaving a committed row pointing at nothing. Anything written recently
    /// is left for the next night.
    /// </summary>
    public int DeleteUnreferenced(IReadOnlySet<string> liveKeys, TimeSpan? minAge = null)
    {
        if (!Directory.Exists(_root)) return 0;

        var cutoff = DateTime.UtcNow - (minAge ?? TimeSpan.FromHours(24));

        var deleted = 0;
        foreach (var path in Directory.EnumerateFiles(_root, "*", SearchOption.AllDirectories))
        {
            var name = System.IO.Path.GetFileName(path);
            // Skip temp files from an in-flight write.
            if (name.StartsWith(".tmp-", StringComparison.Ordinal)) continue;
            if (name.Length != 64 || !name.All(Uri.IsHexDigit)) continue;
            if (liveKeys.Contains(name)) continue;

            try
            {
                if (File.GetLastWriteTimeUtc(path) > cutoff) continue;
                File.Delete(path);
                deleted++;
            }
            catch (Exception ex)
            {
                _logger.LogWarning("Could not delete unreferenced blob {Key}: {Message}", name, ex.Message);
            }
        }
        return deleted;
    }

    private string PathForKey(string blobKey)
    {
        // Reject anything that isn't a plain hex digest — the key reaches this method
        // from database rows, and a crafted value must never escape the store root.
        if (blobKey.Length != 64 || !blobKey.All(Uri.IsHexDigit))
            throw new ArgumentException("Blob key must be a 64-character hex digest.", nameof(blobKey));

        return System.IO.Path.Combine(_root, blobKey[..2], blobKey[2..4], blobKey);
    }

    private static void TryDelete(string path)
    {
        try { if (File.Exists(path)) File.Delete(path); }
        catch { /* best effort */ }
    }
}
