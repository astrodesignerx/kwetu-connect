using NpgsqlTypes;

namespace Kompanion.Api.Data;

public enum FolderSpecialUse
{
    None = 0,
    Inbox,
    Sent,
    Drafts,
    Trash,
    Junk,
    Archive
}

public enum MailboxSyncState
{
    Pending = 0,      // connected, backfill not yet run
    Backfilling = 1,  // initial full-history sync in progress
    Syncing = 2,      // steady state: IDLE + incremental sync
    Error = 3         // see SyncError; if credentials failed, user must reconnect
}

public class MailboxFolder
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid MailboxConnectionId { get; set; }
    public MailboxConnection MailboxConnection { get; set; } = null!;
    public required string FullName { get; set; }
    public uint UidValidity { get; set; }
    public uint? LastUid { get; set; }
    public FolderSpecialUse SpecialUse { get; set; } = FolderSpecialUse.None;
    public bool IsExcluded { get; set; } // Trash/Junk/spam are not synced
    public DateTimeOffset? LastSyncedAt { get; set; }
}

public class MailThread
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid MailboxConnectionId { get; set; }
    public MailboxConnection MailboxConnection { get; set; } = null!;
    public required string RootKey { get; set; }
    public string? NormalizedSubject { get; set; }
    public string? Subject { get; set; }
    public int MessageCount { get; set; }
    public DateTimeOffset? FirstDate { get; set; }
    public DateTimeOffset? LastDate { get; set; }
    public bool HasUnread { get; set; }
    public bool HasAttachments { get; set; }
    public string? Participants { get; set; } // flattened distinct addresses for list display
    public ReplyState ReplyState { get; set; } = ReplyState.ToReply;
    public DateTimeOffset StateSince { get; set; } = DateTimeOffset.UtcNow;
    public bool NeedsNudge { get; set; }
    public string? Snippet { get; set; }      // snippet of the latest message
    public List<MailMessage> Messages { get; set; } = new();
    // Phase 7: at-most-one assignment (the row in ThreadAssignments with this thread id).
    public ThreadAssignment? Assignment { get; set; }
    public List<ThreadNote> Notes { get; set; } = new();
}

public class MailMessage
{
    public long Id { get; set; }
    public Guid MailboxConnectionId { get; set; }
    public Guid FolderId { get; set; }
    public MailboxFolder Folder { get; set; } = null!;
    public Guid? ThreadId { get; set; }
    public MailThread? Thread { get; set; }
    public uint Uid { get; set; }
    public uint UidValidity { get; set; }
    public string? MessageId { get; set; }
    public string? InReplyTo { get; set; }
    public string[] HeaderReferences { get; set; } = Array.Empty<string>();
    public string? Subject { get; set; }
    public string? NormalizedSubject { get; set; }
    public string? FromName { get; set; }
    public string? FromAddr { get; set; }
    public string? ToAddrs { get; set; }
    public string? CcAddrs { get; set; }
    public DateTimeOffset? MessageDate { get; set; }
    public DateTimeOffset? InternalDate { get; set; }
    public string? Snippet { get; set; }
    public string? BodyText { get; set; }
    public string? BodyHtml { get; set; }
    public string[] Flags { get; set; } = Array.Empty<string>();
    public long? SizeBytes { get; set; }
    public bool HasAttachments { get; set; }
    public string? AttachmentMetaJson { get; set; }
    public List<MailAttachment> Attachments { get; set; } = new();
    public NpgsqlTsVector? SearchVector { get; set; } // generated column, never set by EF
    public DateTimeOffset FetchedAt { get; set; } = DateTimeOffset.UtcNow;
}

/// <summary>
/// One attachment, either pulled off an ingested message or staged by a user while
/// composing. The bytes live in the content-addressed blob store
/// (<see cref="Services.Mail.AttachmentStore"/>), never in Postgres — mailbox history
/// is full-history per spec, and multi-MB blobs in the database would bloat every
/// backup and dump. <see cref="BlobKey"/> is the SHA-256 of the content, so the same
/// file appearing on twenty messages is stored once.
/// </summary>
public class MailAttachment
{
    public Guid Id { get; set; } = Guid.NewGuid();

    /// <summary>Set for attachments belonging to a synced message.</summary>
    public long? MessageId { get; set; }
    public MailMessage? Message { get; set; }

    /// <summary>Set once a staged upload is bound to a draft.</summary>
    public Guid? DraftId { get; set; }
    public MailDraft? Draft { get; set; }

    /// <summary>Who uploaded a staged attachment. Null for ingested ones.</summary>
    public Guid? OwnerUserId { get; set; }
    public User? Owner { get; set; }

    public required string FileName { get; set; }
    public string? ContentType { get; set; }
    public long SizeBytes { get; set; }

    /// <summary>MIME Content-Id, for parts referenced by <c>cid:</c> in the HTML body.</summary>
    public string? ContentId { get; set; }
    public bool IsInline { get; set; }

    /// <summary>SHA-256 hex of the content; the key into the blob store.</summary>
    public required string BlobKey { get; set; }

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}

// Auto-populated at ingest from message addresses — groundwork for the Phase 5
// client workspace, so contacts exist before that UI lands.
public class Contact
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public int OrganizationId { get; set; }
    public required string Email { get; set; }
    public string? Name { get; set; }
    public DateTimeOffset LastSeenAt { get; set; }
    public int MessageCount { get; set; }
}

/// <summary>
/// A draft email being composed. Lives only in the local database; not pushed to the
/// server's Drafts folder (kept simple for Phase 3). On Send the draft is handed to
/// <see cref="Services.Mail.SmtpSender"/>; the server's auto-Sent save is then picked
/// up by the next sync and threaded in via <c>Message-ID</c>.
/// </summary>
public class MailDraft
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid MailboxConnectionId { get; set; }
    public MailboxConnection MailboxConnection { get; set; } = null!;

    /// <summary>The latest message in the thread being replied to, or null for a new composition.</summary>
    public long? ReplyToMessageId { get; set; }
    public string? ReplyToAddress { get; set; }
    public string? ReferencesJson { get; set; } // serialized string[] — populated on reply

    /// <summary>The thread being replied to, so a resumed draft still resolves reply headers.</summary>
    public Guid? ReplyToThreadId { get; set; }
    /// <summary>Set when the body is fully self-branded; the send pipeline skips the brand kit.</summary>
    public bool SkipBrandWrap { get; set; }

    public string? ToAddrs { get; set; }
    public string? CcAddrs { get; set; }
    public string? BccAddrs { get; set; }
    public string? Subject { get; set; }
    public string? BodyText { get; set; }
    public string? BodyHtml { get; set; }
    public bool HasAttachments { get; set; }
    public string? AttachmentMetaJson { get; set; } // jsonb
    public List<MailAttachment> Attachments { get; set; } = new();

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;

    /// <summary>Optimistic concurrency for overlapping autosaves: losers reload and retry once.</summary>
    public uint RowVersion { get; set; }
}

/// <summary>
/// The company's brand identity applied to outbound HTML emails. Single row per
/// organization; templates inherit header / footer / signature unless they opt out.
/// </summary>
public class BrandKit
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public int OrganizationId { get; set; }
    public Organization Organization { get; set; } = null!;

    public string? Name { get; set; }
    public string? PrimaryColor { get; set; }   // hex e.g. #FBB040
    public string? AccentColor { get; set; }
    public string? TextColor { get; set; }
    public string? BackgroundColor { get; set; }
    public string? LogoUrl { get; set; }        // absolute https URL (fetched by recipients)

    public string? HeaderHtml { get; set; }      // raw HTML fragment, optional
    public string? FooterHtml { get; set; }
    public string? SignatureHtml { get; set; }   // appended after body

    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
}

/// <summary>
/// A reusable outbound email template. Body is HTML with <c>{{variable}}</c> placeholders
/// that are substituted at compose / send time. The brand kit's header/footer/signature
/// wrap the rendered body unless the template sets <see cref="SkipBrandWrap"/>.
/// </summary>
public class EmailTemplate
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public int OrganizationId { get; set; }
    public Organization Organization { get; set; } = null!;

    public required string Name { get; set; }
    public string? Description { get; set; }
    public string? Subject { get; set; }      // subject with placeholders
    public string? BodyHtml { get; set; }    // body with placeholders
    public string? VariablesJson { get; set; } // jsonb: declared variables [{name, label, default?}]
    public bool SkipBrandWrap { get; set; }

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
}

/// <summary>
/// A client (the "company" side of a business relationship). Independent of any contact —
/// contacts may or may not be linked to a company; the company view aggregates all
/// correspondence associated with the company directly or via any of its projects.
/// </summary>
public class Company
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public int OrganizationId { get; set; }
    public Organization Organization { get; set; } = null!;

    public required string Name { get; set; }
    public string? Domain { get; set; }      // primary email domain — used for auto-linking contacts
    public string? Notes { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
    public List<Project> Projects { get; set; } = new();
}

/// <summary>
/// A piece of work for a company (e.g. "Riverdale Apartments website redesign").
/// Projects roll up thread associations for finer-grained grouping than company alone.
/// </summary>
public class Project
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid CompanyId { get; set; }
    public Company Company { get; set; } = null!;

    public required string Name { get; set; }
    public string? Description { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
}

/// <summary>
/// Many-to-many link: a thread is associated with a company. A thread is typically
/// linked to at most one company; duplicate links are prevented via the unique index.
/// </summary>
public class ThreadCompany
{
    public Guid ThreadId { get; set; }
    public MailThread Thread { get; set; } = null!;
    public Guid CompanyId { get; set; }
    public Company Company { get; set; } = null!;
    public DateTimeOffset LinkedAt { get; set; } = DateTimeOffset.UtcNow;
}

public class ThreadProject
{
    public Guid ThreadId { get; set; }
    public MailThread Thread { get; set; } = null!;
    public Guid ProjectId { get; set; }
    public Project Project { get; set; } = null!;
    public DateTimeOffset LinkedAt { get; set; } = DateTimeOffset.UtcNow;
}

public class ThreadContact
{
    public Guid ThreadId { get; set; }
    public MailThread Thread { get; set; } = null!;
    public Guid ContactId { get; set; }
    public Contact Contact { get; set; } = null!;
    public DateTimeOffset LinkedAt { get; set; } = DateTimeOffset.UtcNow;
}

/// <summary>
/// A thread can be assigned to a single member of the organization. Assignment is
/// workspace metadata — it does not move the thread or change who can read it. Every
/// member of the org can see and change the assignment; the assignee sees a
/// dedicated "Assigned to me" filter in the inbox.
/// </summary>
public class ThreadAssignment
{
    public Guid ThreadId { get; set; }
    public MailThread Thread { get; set; } = null!;
    public Guid UserId { get; set; }
    public User User { get; set; } = null!;
    public Guid AssignedByUserId { get; set; }
    public User AssignedBy { get; set; } = null!;
    public DateTimeOffset AssignedAt { get; set; } = DateTimeOffset.UtcNow;
}

/// <summary>
/// An internal note attached to a thread. Visible to every member of the org; never
/// sent to the client. Plain text — these are workspace notes, not mail.
/// </summary>
public class ThreadNote
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid ThreadId { get; set; }
    public MailThread Thread { get; set; } = null!;
    public Guid AuthorUserId { get; set; }
    public User Author { get; set; } = null!;
    public required string Body { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
}

public enum SendOperationStatus
{
    /// <summary>Claimed and in flight. A duplicate key waits for the outcome, never resends.</summary>
    Sending = 0,
    /// <summary>SMTP accepted. Replays return the original result without another send.</summary>
    Accepted = 1,
    /// <summary>SMTP outcome unknown (transport failed mid-send). Never resend under this key.</summary>
    Uncertain = 2,
    /// <summary>Failed before any transmission (validation, missing bytes, unreachable host). Same key may retry.</summary>
    Failed = 3
}

/// <summary>
/// Durable record of one send request, keyed by the caller's idempotency key.
/// SMTP cannot guarantee exactly-once across a crash, so the record tracks what is
/// known: a retry with the same key and content replays the original result, a
/// changed payload is rejected, and an uncertain outcome is never resent.
/// </summary>
public class SendOperation
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid CallerUserId { get; set; }
    public User Caller { get; set; } = null!;
    public Guid MailboxConnectionId { get; set; }
    public MailboxConnection MailboxConnection { get; set; } = null!;
    /// <summary>Client-supplied Idempotency-Key, scoped to caller and mailbox.</summary>
    public required string RequestKey { get; set; }
    /// <summary>SHA-256 over the canonical send payload; key reuse with changed content is rejected.</summary>
    public required string PayloadHash { get; set; }
    /// <summary>Message-ID generated once per operation and used on the wire.</summary>
    public required string WireMessageId { get; set; }
    /// <summary>The draft this send consumes, if any. Guards against resurrecting sent drafts.</summary>
    public Guid? DraftId { get; set; }
    /// <summary>Resolved effective payload (addresses, rendered bodies, reply chain, attachment ids) for safe retry.</summary>
    public string? EffectivePayloadJson { get; set; }
    public SendOperationStatus Status { get; set; } = SendOperationStatus.Sending;
    public string? ResultMessageId { get; set; }
    public string? Error { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
}

/// <summary>
/// Marks a draft id as consumed (sent) or discarded. Autosaves arriving after the
/// tombstone are rejected instead of resurrecting the row, including delayed
/// in-flight saves and cross-connection id reuse.
/// </summary>
public class DraftTombstone
{
    public Guid DraftId { get; set; }
    public Guid MailboxConnectionId { get; set; }
    public required string Reason { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}
