namespace Kompanion.Api.Models;

public record MailboxStatusDto(
    Guid Id, string Email, string SyncState, string? SyncError,
    DateTimeOffset? LastSyncCompletedAt, int MessageCount, int UnreadCount,
    string ImapHost, string SmtpHost);

public record MailOverviewDto(List<MailboxStatusDto> Mailboxes);

public record ThreadSummaryDto(
    Guid Id, string? Subject, string? Participants, string? Snippet,
    int MessageCount, DateTimeOffset? FirstDate, DateTimeOffset? LastDate,
    bool HasUnread, bool HasAttachments, string ReplyState = "ToReply",
    DateTimeOffset StateSince = default, bool NeedsNudge = false);

public record ThreadListResponse(int Total, List<ThreadSummaryDto> Items);

/// <summary>How many threads sit behind each filter tab.</summary>
public record ThreadCountsDto(int Inbox, int Unread, int Mine, int Sent, int Archive, int All);

/// <summary>An attachment the client can download. Bytes are fetched separately.</summary>
public record AttachmentDto(
    Guid Id, string FileName, string? ContentType, long SizeBytes,
    bool IsInline, string? ContentId);

public record MessageDto(
    long Id, string? MessageId, string FolderName, string FolderSpecialUse,
    string? FromName, string? FromAddr,
    string? ToAddrs, string? CcAddrs,
    DateTimeOffset? Date, string? Subject, string? Snippet,
    string? BodyText, string? BodyHtml,
    string[] Flags, bool HasAttachments, string? AttachmentMetaJson,
    List<AttachmentDto> Attachments);

public record ThreadDetailDto(
    Guid Id, string? Subject,
    DateTimeOffset? FirstDate, DateTimeOffset? LastDate,
    int MessageCount, bool HasUnread,
    List<MessageDto> Messages, string ReplyState = "ToReply",
    DateTimeOffset StateSince = default, bool NeedsNudge = false);

public record SetReadRequest(bool Read);
public record MoveThreadRequest(string Target);

public record MailDraftDto(
    Guid Id, Guid MailboxConnectionId,
    long? ReplyToMessageId, string? ReplyToAddress,
    string? References,
    string? ToAddrs, string? CcAddrs, string? BccAddrs,
    string? Subject, string? BodyText, string? BodyHtml,
    bool HasAttachments, string? AttachmentMetaJson,
    DateTimeOffset CreatedAt, DateTimeOffset UpdatedAt,
    Guid? ReplyToThreadId = null, bool SkipBrandWrap = false,
    string? InReplyTo = null, List<AttachmentDto>? Attachments = null,
    DraftLastSendDto? LastSend = null,
    uint RowVersion = 0);

/// <summary>Latest send attempt recorded against a draft, for any member.</summary>
public record DraftLastSendDto(
    string Key, string Status,
    string? ToAddrs, string? CcAddrs, string? BccAddrs,
    string? Subject, string? BodyHtml,
    List<Guid>? AttachmentIds, bool SkipBrandWrap,
    string? RawToAddrs, string? RawCcAddrs, string? RawBccAddrs,
    string? RawSubject, string? RawBodyHtml, List<Guid>? RawAttachmentIds);

public record DraftUpsertRequest(
    Guid Id,
    Guid MailboxConnectionId,
    long? ReplyToMessageId, string? ReplyToAddress,
    string? References,
    string? ToAddrs, string? CcAddrs, string? BccAddrs,
    string? Subject, string? BodyText, string? BodyHtml,
    bool HasAttachments, string? AttachmentMetaJson,
    Guid? ReplyToThreadId = null, bool SkipBrandWrap = false,
    List<Guid>? AttachmentIds = null,
    /// <summary>
    /// Row version the caller last saw. When present and stale, the save is rejected
    /// instead of silently overwriting a teammate's (or a racing autosave's) edit.
    /// </summary>
    uint? ExpectedVersion = null);

public record SendRequest(
    Guid MailboxConnectionId,
    Guid? DraftId,
    /// <summary>For a reply: the thread being replied to. Resolved server-side to set In-Reply-To / References.</summary>
    Guid? ReplyToThreadId,
    string? ToAddrs, string? CcAddrs, string? BccAddrs,
    string? Subject, string? BodyText, string? BodyHtml,
    /// <summary>Ids returned by POST /api/mail/attachments, attached to the outgoing message.</summary>
    List<Guid>? AttachmentIds = null,
    /// <summary>
    /// Set when the body is a complete, self-branded email — a template that carries
    /// its own letterhead and footer. The brand kit is then left off rather than
    /// wrapping a second set of chrome around it.
    /// </summary>
    bool SkipBrandWrap = false,
    /// <summary>
    /// Stable caller-generated request key. Replays with the same key and content
    /// return the original result without another send; reuse with changed content
    /// is rejected. Null means no idempotency tracking.
    /// </summary>
    string? IdempotencyKey = null);

public record SendResponse(string MessageId, bool Deduplicated);

public record BrandKitDto(
    Guid Id, string? Name,
    string? PrimaryColor, string? AccentColor, string? TextColor, string? BackgroundColor,
    string? LogoUrl,
    string? HeaderHtml, string? FooterHtml, string? SignatureHtml,
    DateTimeOffset UpdatedAt);

public record BrandKitUpsertRequest(
    string? Name,
    string? PrimaryColor, string? AccentColor, string? TextColor, string? BackgroundColor,
    string? LogoUrl,
    string? HeaderHtml, string? FooterHtml, string? SignatureHtml);

public record EmailTemplateSummaryDto(
    Guid Id, string Name, string? Description, string? Subject,
    string[] Variables);

public record EmailTemplateDto(
    Guid Id, string Name, string? Description, string? Subject, string? BodyHtml,
    string[] Variables, bool SkipBrandWrap,
    DateTimeOffset CreatedAt, DateTimeOffset UpdatedAt);

/// A template as the gallery shows it: the card's own fields, plus the subject and
/// body already rendered with example values and the brand kit around them.
///
/// <c>Lists</c> are the repeatable blocks the body declares — an agenda, a set of
/// deliverables. They are separate from <c>Variables</c> because they are answered
/// with any number of values rather than one.
public record EmailTemplatePreviewDto(
    Guid Id, string Name, string? Description, string[] Variables,
    string[] Lists,
    string Subject, string BodyHtml, DateTimeOffset UpdatedAt);

public record EmailTemplateUpsertRequest(
    string Name, string? Description, string? Subject, string? BodyHtml,
    string[] Variables, bool SkipBrandWrap);

/// <param name="Values">
/// Real answers, keyed by placeholder name. Anything missing falls back to the
/// example value, so a half-filled form still previews as a finished email rather
/// than one with holes in it.
/// </param>
/// <param name="Lists">Answers for repeatable blocks, keyed by list name.</param>
/// <param name="Wrap">
/// False returns the substituted body on its own — what the composer drops into the
/// editor, since the brand kit is applied when the message is actually sent.
/// </param>
public record TemplatePreviewRequest(
    string? Subject, string? BodyHtml,
    string[] Variables,
    bool SkipBrandWrap,
    Dictionary<string, string?>? Values = null,
    Dictionary<string, List<string>>? Lists = null,
    bool Wrap = true);

public record TemplatePreviewResponse(string Subject, string BodyHtml);

public record TemplateComposeStart(
    string Subject, string BodyHtml, string[] Variables);

// ---------- Phase 5: Client workspace ----------

public record CompanyDto(
    Guid Id, string Name, string? Domain, string? Notes,
    int ProjectCount, int ThreadCount, int UnreadThreadCount,
    DateTimeOffset CreatedAt, DateTimeOffset UpdatedAt);

public record CompanyUpsertRequest(string Name, string? Domain, string? Notes);

public record ProjectDto(
    Guid Id, Guid CompanyId, string Name, string? Description,
    int ThreadCount, int UnreadThreadCount,
    DateTimeOffset CreatedAt, DateTimeOffset UpdatedAt);

public record ProjectUpsertRequest(string Name, string? Description);

public record ContactSummaryDto(Guid Id, string Email, string? Name, int MessageCount);

public record ThreadAssociationsDto(
    Guid ThreadId,
    CompanyDto? Company,
    List<ProjectDto> Projects,
    List<ContactSummaryDto> Contacts);

public record CompanyDetailDto(
    CompanyDto Company,
    List<ProjectDto> Projects,
    List<ContactSummaryDto> Contacts,
    List<ThreadSummaryDto> Threads);

// ---------- Phase 6: AI assistant ----------

public record SummarizeRequest(Guid ThreadId);
public record SummarizeResponse(string Summary, int MessageCount, string Model);

public record SuggestReplyRequest(Guid ThreadId, string? Tone);
public record SuggestReplyResponse(string Reply);

public record RewriteRequest(string Body, string Tone);
public record RewriteResponse(string Body);

// ---------- Phase 7: Team collaboration ----------

public record OrgMemberDto(Guid Id, string Email, string Username, string DisplayName, string Role);

public record AssignRequest(Guid UserId);

public record ThreadAssignmentDto(
    Guid ThreadId, Guid UserId, string UserEmail, string UserDisplayName,
    Guid AssignedByUserId, string AssignedByEmail, DateTimeOffset AssignedAt);

public record NoteDto(
    Guid Id, Guid ThreadId, Guid AuthorUserId, string AuthorEmail, string AuthorDisplayName,
    string Body, DateTimeOffset CreatedAt, DateTimeOffset UpdatedAt);

public record NoteUpsertRequest(string Body);

public record PresenceDto(Guid UserId, string Email, string DisplayName, bool Online);
