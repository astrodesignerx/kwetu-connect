// Shared DTO types — mirrors apps/api/Models/Dtos.cs.
// Hand-maintained for Phase 1; OpenAPI-based generation is the planned upgrade path
// so a future React Native app consumes the exact same contract.

export type Role = "Member" | "Admin";

export interface UserDto {
  id: string;
  email: string;
  /** Login handle, stored lowercase without the "@". Displayed as @username. */
  username: string;
  displayName: string;
  role: Role;
  createdAt: string;
}

export interface AuthResponse {
  token: string;
  user: UserDto;
}

export interface RegisterRequest {
  email: string;
  password: string;
  displayName: string;
  /** Required unless this is the first account in the deployment. */
  inviteToken?: string;
  /** Optional handle. Derived from the display name when omitted. */
  username?: string;
}

export interface RegistrationModeResponse {
  /** "bootstrap" when no accounts exist yet, otherwise "invite". */
  mode: "bootstrap" | "invite";
}

export type InvitationStatus = "pending" | "accepted" | "revoked" | "expired";

export interface InvitationDto {
  id: string;
  email: string;
  role: Role;
  createdAt: string;
  expiresAt: string;
  acceptedAt: string | null;
  revokedAt: string | null;
  status: InvitationStatus;
}

export interface CreateInvitationRequest {
  email: string;
  role?: Role;
}

export interface CreateInvitationResponse {
  invitation: InvitationDto;
  /** Shown once. Only its hash is stored server-side, so it can't be retrieved again. */
  token: string;
}

export interface LoginRequest {
  /** Email address or username handle; a leading "@" is accepted. */
  identifier: string;
  password: string;
}

export interface UpdateProfileRequest {
  displayName?: string;
  username?: string;
  currentPassword?: string;
  newPassword?: string;
}

export interface UpdateProfileResponse {
  user: UserDto;
  /**
   * Non-null only when the password changed. Changing it revokes every existing
   * token, so the caller must store this one to stay signed in.
   */
  token: string | null;
}

export interface ConnectMailboxRequest {
  email: string;
  password: string;
  imapHost?: string;
  imapPort?: number;
  smtpHost?: string;
  smtpPort?: number;
}

export interface MailboxDto {
  id: string;
  email: string;
  imapHost: string;
  imapPort: number;
  smtpHost: string;
  smtpPort: number;
  isActive: boolean;
  createdAt: string;
  lastVerifiedAt: string | null;
  ownerEmail: string | null;
}

export interface AdminUserDto {
  id: string;
  email: string;
  username: string;
  displayName: string;
  role: Role;
  mailboxCount: number;
  createdAt: string;
  lastLoginAt: string | null;
}

export interface AuditLogDto {
  id: number;
  actorEmail: string;
  action: string;
  targetEmail: string | null;
  targetMailboxId: string | null;
  details: string | null;
  createdAt: string;
}

export type FolderSpecialUse =
  | "None"
  | "Inbox"
  | "Sent"
  | "Drafts"
  | "Trash"
  | "Junk"
  | "Archive";

export interface MailboxStatusDto {
  id: string;
  email: string;
  syncState: "Pending" | "Backfilling" | "Syncing" | "Error";
  syncError: string | null;
  lastSyncCompletedAt: string | null;
  messageCount: number;
  unreadCount: number;
  imapHost: string;
  smtpHost: string;
}

export interface MailOverviewDto {
  mailboxes: MailboxStatusDto[];
}

export interface ThreadSummaryDto {
  id: string;
  subject: string | null;
  participants: string | null;
  snippet: string | null;
  messageCount: number;
  firstDate: string | null;
  lastDate: string | null;
  hasUnread: boolean;
  hasAttachments: boolean;
}

export interface ThreadListResponse {
  total: number;
  items: ThreadSummaryDto[];
}

/** How many threads sit behind each filter tab. */
export interface ThreadCountsDto {
  inbox: number;
  unread: number;
  mine: number;
  sent: number;
  archive: number;
  all: number;
}

export interface AttachmentDto {
  id: string;
  fileName: string;
  contentType: string | null;
  sizeBytes: number;
  /** True for cid:-referenced parts embedded in the HTML body, not shown as files. */
  isInline: boolean;
  contentId: string | null;
}

export interface MessageDto {
  id: number;
  messageId: string | null;
  folderName: string;
  folderSpecialUse: string;
  fromName: string | null;
  fromAddr: string | null;
  toAddrs: string | null;
  ccAddrs: string | null;
  date: string | null;
  subject: string | null;
  snippet: string | null;
  bodyText: string | null;
  bodyHtml: string | null;
  flags: string[];
  hasAttachments: boolean;
  attachmentMetaJson: string | null;
  attachments: AttachmentDto[];
}

export interface ThreadDetailDto {
  id: string;
  subject: string | null;
  firstDate: string | null;
  lastDate: string | null;
  messageCount: number;
  hasUnread: boolean;
  messages: MessageDto[];
}

export interface MailDraftDto {
  id: string;
  mailboxConnectionId: string;
  replyToMessageId: number | null;
  replyToAddress: string | null;
  references: string | null;
  toAddrs: string | null;
  ccAddrs: string | null;
  bccAddrs: string | null;
  subject: string | null;
  bodyText: string | null;
  bodyHtml: string | null;
  hasAttachments: boolean;
  attachmentMetaJson: string | null;
  createdAt: string;
  updatedAt: string;
  replyToThreadId: string | null;
  skipBrandWrap: boolean;
  /** Actual In-Reply-To resolved from the reply target. */
  inReplyTo: string | null;
  /** Files bound to this draft, owned or shared through it. */
  attachments: AttachmentDto[];
  /** Latest send attempt recorded against this draft, for any member. */
  lastSend: {
    key: string;
    status: string;
    to: string | null;
    cc: string | null;
    bcc: string | null;
    subject: string | null;
    body: string | null;
    attachmentIds: string[];
    skipBrandWrap: boolean;
    rawTo: string | null;
    rawCc: string | null;
    rawBcc: string | null;
    rawSubject: string | null;
    rawBody: string | null;
    rawAttachmentIds: string[] | null;
  } | null;
  /** Optimistic concurrency token for autosave conflict detection. */
  rowVersion: number;
}

export interface DraftUpsertRequest {
  id: string;
  mailboxConnectionId: string;
  replyToMessageId: number | null;
  replyToAddress: string | null;
  references: string | null;
  toAddrs: string | null;
  ccAddrs: string | null;
  bccAddrs: string | null;
  subject: string | null;
  bodyText: string | null;
  bodyHtml: string | null;
  hasAttachments: boolean;
  attachmentMetaJson: string | null;
  replyToThreadId: string | null;
  skipBrandWrap: boolean;
  /** Staged upload ids to bind to this draft. */
  attachmentIds?: string[] | null;
  /**
   * Row version the caller last saw. When present and stale, the save is
   * rejected instead of silently overwriting another edit.
   */
  expectedVersion?: number | null;
}

export interface SendRequest {
  mailboxConnectionId: string;
  draftId: string | null;
  replyToThreadId: string | null;
  toAddrs: string | null;
  ccAddrs: string | null;
  bccAddrs: string | null;
  subject: string | null;
  bodyText: string | null;
  bodyHtml: string | null;
  /** Ids from uploadAttachment, attached to the outgoing message. */
  attachmentIds?: string[];
  /**
   * Set when the body is a complete, self-branded email — a template carrying its
   * own letterhead and footer. The brand kit is then left off rather than wrapping
   * a second set of chrome around it.
   */
  skipBrandWrap?: boolean;
  /**
   * Stable caller-generated request key. Required: every send is a durable
   * operation, and replays with the same key and content return the original
   * result without another send.
   */
  idempotencyKey: string;
}

export interface SendResponse {
  messageId: string;
  /** True when this result replays an earlier accepted send, with no new delivery. */
  deduplicated: boolean;
}

export interface BrandKitDto {
  id: string;
  name: string | null;
  primaryColor: string | null;
  accentColor: string | null;
  textColor: string | null;
  backgroundColor: string | null;
  logoUrl: string | null;
  headerHtml: string | null;
  footerHtml: string | null;
  signatureHtml: string | null;
  updatedAt: string;
}

export interface BrandKitUpsertRequest {
  name: string | null;
  primaryColor: string | null;
  accentColor: string | null;
  textColor: string | null;
  backgroundColor: string | null;
  logoUrl: string | null;
  headerHtml: string | null;
  footerHtml: string | null;
  signatureHtml: string | null;
}

export interface EmailTemplateSummaryDto {
  id: string;
  name: string;
  description: string | null;
  subject: string | null;
  variables: string[];
}

export interface EmailTemplateDto {
  id: string;
  name: string;
  description: string | null;
  subject: string | null;
  bodyHtml: string | null;
  variables: string[];
  skipBrandWrap: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * A template as the gallery shows it: the card's own fields, plus the subject and
 * body already rendered with example values and the brand kit around them.
 */
export interface EmailTemplatePreviewDto {
  id: string;
  name: string;
  description: string | null;
  variables: string[];
  /**
   * Repeatable blocks the body declares with `{{#each name}}`, e.g. an agenda.
   * Answered with any number of values, which is why they are not `variables`.
   */
  lists: string[];
  subject: string;
  bodyHtml: string;
  updatedAt: string;
}

export interface EmailTemplateUpsertRequest {
  name: string;
  description: string | null;
  subject: string | null;
  bodyHtml: string | null;
  variables: string[];
  skipBrandWrap: boolean;
}

export interface TemplatePreviewRequest {
  subject: string | null;
  bodyHtml: string | null;
  variables: string[];
  skipBrandWrap: boolean;
  /** Real answers. Anything missing falls back to the server's example value. */
  values?: Record<string, string | null>;
  /** Answers for repeatable blocks, keyed by list name. */
  lists?: Record<string, string[]>;
  /**
   * False returns the substituted body on its own, without the brand kit around
   * it — what the composer drops into the editor, since the kit is applied when
   * the message is sent.
   */
  wrap?: boolean;
}

export interface TemplatePreviewResponse {
  subject: string;
  bodyHtml: string;
}

export interface CompanyDto {
  id: string;
  name: string;
  domain: string | null;
  notes: string | null;
  projectCount: number;
  threadCount: number;
  unreadThreadCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface CompanyUpsertRequest {
  name: string;
  domain: string | null;
  notes: string | null;
}

export interface ProjectDto {
  id: string;
  companyId: string;
  name: string;
  description: string | null;
  threadCount: number;
  unreadThreadCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectUpsertRequest {
  name: string;
  description: string | null;
}

export interface ContactSummaryDto {
  id: string;
  email: string;
  name: string | null;
  messageCount: number;
}

export interface ThreadAssociationsDto {
  threadId: string;
  company: CompanyDto | null;
  projects: ProjectDto[];
  contacts: ContactSummaryDto[];
}

export interface CompanyDetailDto {
  company: CompanyDto;
  projects: ProjectDto[];
  contacts: ContactSummaryDto[];
  threads: ThreadSummaryDto[];
}

export interface SummarizeRequest {
  threadId: string;
}
export interface SummarizeResponse {
  summary: string;
  messageCount: number;
  model: string;
}

export interface SuggestReplyRequest {
  threadId: string;
  tone: string | null;
}
export interface SuggestReplyResponse {
  reply: string;
}

export interface RewriteRequest {
  body: string;
  tone: string | null;
}
export interface RewriteResponse {
  body: string;
}

export interface AiStatus {
  configured: boolean;
  model: string;
}

export interface OrgMemberDto {
  id: string;
  email: string;
  username: string;
  displayName: string;
  role: Role;
}

export interface ThreadAssignmentDto {
  threadId: string;
  userId: string;
  userEmail: string;
  userDisplayName: string;
  assignedByUserId: string;
  assignedByEmail: string;
  assignedAt: string;
}

export interface NoteDto {
  id: string;
  threadId: string;
  authorUserId: string;
  authorEmail: string;
  authorDisplayName: string;
  body: string;
  createdAt: string;
  updatedAt: string;
}

export interface NoteUpsertRequest {
  body: string;
}

export interface AssignRequest {
  userId: string;
}
