import type {
  AdminUserDto,
  AiStatus,
  AssignRequest,
  AttachmentDto,
  AuditLogDto,
  CreateInvitationRequest,
  CreateInvitationResponse,
  InvitationDto,
  RegistrationModeResponse,
  UpdateProfileResponse,
  AuthResponse,
  BrandKitDto,
  BrandKitUpsertRequest,
  CompanyDetailDto,
  CompanyDto,
  CompanyUpsertRequest,
  ConnectMailboxRequest,
  DraftUpsertRequest,
  EmailTemplateDto,
  EmailTemplatePreviewDto,
  EmailTemplateSummaryDto,
  EmailTemplateUpsertRequest,
  LoginRequest,
  MailboxDto,
  MailboxStatusDto,
  MailDraftDto,
  MailOverviewDto,
  MessageDto,
  NoteDto,
  NoteUpsertRequest,
  OrgMemberDto,
  ProjectDto,
  ProjectUpsertRequest,
  RegisterRequest,
  Role,
  SendRequest,
  SendResponse,
  SummarizeRequest,
  SummarizeResponse,
  SuggestReplyRequest,
  SuggestReplyResponse,
  RewriteRequest,
  RewriteResponse,
  TemplatePreviewRequest,
  TemplatePreviewResponse,
  ThreadAssignmentDto,
  ThreadAssociationsDto,
  ThreadDetailDto,
  ThreadCountsDto,
  ThreadListResponse,
  UpdateProfileRequest,
  UserDto,
} from "@kompanion/types";

export class ApiError extends Error {
  readonly status: number;
  /** Machine-readable failure kind when the server provides one (e.g. send outcomes). */
  readonly code?: string;

  constructor(status: number, message: string, code?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

export interface ApiClientOptions {
  /** Defaults to same-origin; the Next.js dev server proxies /api/* to the backend. */
  baseUrl?: string;
  getToken: () => string | null;
  /**
   * Called when an authenticated request is rejected with 401 (expired or revoked
   * session). Not called for anonymous requests, so ordinary login failures never
   * trigger a session reset.
   */
  onUnauthorized?: () => void;
}

export function createApiClient(options: ApiClientOptions) {
  const baseUrl = options.baseUrl ?? "";

  function noteUnauthorized(tokenUsed: string | null) {
    // Fire only when the failing request still represents the current session. A
    // delayed 401 from a previous session must never log out the new one, and an
    // anonymous 401 is an ordinary login failure, not a dead session.
    if (!tokenUsed) return;
    if (options.getToken() !== tokenUsed) return;
    options.onUnauthorized?.();
  }

  async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const token = options.getToken();
    const res = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(init?.headers ?? {}),
      },
    });

    if (res.status === 401) noteUnauthorized(token);
    if (res.status === 204) return undefined as T;

    const body: unknown = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = body as { error?: string; code?: string };
      const message = err.error ?? `Request failed (${res.status})`;
      if (res.status === 401) noteUnauthorized(token);
      throw new ApiError(res.status, message, err.code);
    }
    return body as T;
  }

  return {
    register: (input: RegisterRequest) =>
      request<AuthResponse>("/api/auth/register", { method: "POST", body: JSON.stringify(input) }),
    login: (input: LoginRequest) =>
      request<AuthResponse>("/api/auth/login", { method: "POST", body: JSON.stringify(input) }),
    me: () => request<UserDto>("/api/auth/me"),
    updateMe: (input: UpdateProfileRequest) =>
      request<UpdateProfileResponse>("/api/auth/me", { method: "PATCH", body: JSON.stringify(input) }),
    /** Whether this deployment still needs its first (admin) account. */
    registrationMode: () => request<RegistrationModeResponse>("/api/auth/registration-mode"),

    listMailboxes: () => request<MailboxDto[]>("/api/mailboxes"),
    connectMailbox: (input: ConnectMailboxRequest) =>
      request<MailboxDto>("/api/mailboxes", { method: "POST", body: JSON.stringify(input) }),
    disconnectMailbox: (id: string) =>
      request<void>(`/api/mailboxes/${id}`, { method: "DELETE" }),
    reverifyMailbox: (id: string) =>
      request<MailboxDto>(`/api/mailboxes/${id}/reverify`, { method: "POST" }),

    adminListUsers: () => request<AdminUserDto[]>("/api/admin/users"),
    adminUpdateRole: (id: string, role: Role) =>
      request<AdminUserDto>(`/api/admin/users/${id}/role`, {
        method: "PATCH",
        body: JSON.stringify({ role }),
      }),
    adminListMailboxes: () => request<MailboxDto[]>("/api/admin/mailboxes"),
    adminListInvitations: () => request<InvitationDto[]>("/api/admin/invitations"),
    adminCreateInvitation: (input: CreateInvitationRequest) =>
      request<CreateInvitationResponse>("/api/admin/invitations", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    adminRevokeInvitation: (id: string) =>
      request<void>(`/api/admin/invitations/${id}`, { method: "DELETE" }),
    adminAuditLog: () => request<AuditLogDto[]>("/api/admin/audit-log"),

    mailOverview: () => request<MailOverviewDto>("/api/mail/overview"),
    listThreads: (params: {
      connectionId: string;
      folder?: string;
      q?: string;
      mine?: boolean;
      page?: number;
      pageSize?: number;
    }) => {
      const search = new URLSearchParams();
      search.set("connectionId", params.connectionId);
      if (params.folder) search.set("folder", params.folder);
      if (params.q) search.set("q", params.q);
      if (params.mine) search.set("mine", "true");
      if (params.page) search.set("page", String(params.page));
      if (params.pageSize) search.set("pageSize", String(params.pageSize));
      return request<ThreadListResponse>(`/api/mail/threads?${search.toString()}`);
    },
    threadCounts: (connectionId: string) =>
      request<ThreadCountsDto>(`/api/mail/thread-counts?connectionId=${connectionId}`),
    getThread: (id: string) => request<ThreadDetailDto>(`/api/mail/threads/${id}`),
    setThreadRead: (id: string, read: boolean) =>
      request<void>(`/api/mail/threads/${id}/read`, {
        method: "POST",
        body: JSON.stringify({ read }),
      }),
    moveThread: (id: string, target: "Archive" | "Trash") =>
      request<void>(`/api/mail/threads/${id}/move`, {
        method: "POST",
        body: JSON.stringify({ target }),
      }),
    triggerMailboxSync: (id: string) =>
      request<void>(`/api/mail/mailboxes/${id}/sync`, { method: "POST" }),

    /**
     * Fetches an attachment's bytes as a Blob. A plain <a download> can't be used —
     * the bearer token lives in memory, not a cookie, so the request has to carry the
     * Authorization header. Callers turn the Blob into an object URL to save it.
     */
    downloadAttachment: async (id: string): Promise<Blob> => {
      const token = options.getToken();
      const res = await fetch(`${baseUrl}/api/mail/attachments/${id}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.status === 401) noteUnauthorized(token);
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string; code?: string };
        throw new ApiError(res.status, body.error ?? `Download failed (${res.status})`, body.code);
      }
      return res.blob();
    },

    /** Stages a file for an outgoing message; returns the id to pass in SendRequest. */
    uploadAttachment: async (file: File, draftId?: string): Promise<AttachmentDto> => {
      const token = options.getToken();
      const form = new FormData();
      form.append("file", file);
      const query = draftId ? `?draftId=${encodeURIComponent(draftId)}` : "";
      // No Content-Type header — the browser must set the multipart boundary itself.
      const res = await fetch(`${baseUrl}/api/mail/attachments${query}`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: form,
      });
      if (res.status === 401) noteUnauthorized(token);
      const body: unknown = await res.json().catch(() => ({}));
      if (!res.ok) {
        const err = body as { error?: string; code?: string };
        throw new ApiError(res.status, err.error ?? `Upload failed (${res.status})`, err.code);
      }
      return body as AttachmentDto;
    },

    deleteStagedAttachment: (id: string) =>
      request<void>(`/api/mail/attachments/${id}`, { method: "DELETE" }),

    listDrafts: (connectionId: string) =>
      request<MailDraftDto[]>(`/api/mail/drafts?connectionId=${connectionId}`),
    getDraft: (id: string) => request<MailDraftDto>(`/api/mail/drafts/${id}`),
    upsertDraft: (req: DraftUpsertRequest) =>
      request<MailDraftDto>("/api/mail/drafts", {
        method: "POST",
        body: JSON.stringify(req),
      }),
    deleteDraft: (id: string) =>
      request<void>(`/api/mail/drafts/${id}`, { method: "DELETE" }),
    sendMail: (req: SendRequest) =>
      request<SendResponse>("/api/mail/send", {
        method: "POST",
        body: JSON.stringify(req),
      }),

    getBrandKit: () => request<BrandKitDto>("/api/brand-kit"),
    updateBrandKit: (req: BrandKitUpsertRequest) =>
      request<BrandKitDto>("/api/brand-kit", {
        method: "PUT",
        body: JSON.stringify(req),
      }),
    listTemplates: () => request<EmailTemplateSummaryDto[]>("/api/templates"),
    listTemplatePreviews: () =>
      request<EmailTemplatePreviewDto[]>("/api/templates/previews"),
    getTemplate: (id: string) =>
      request<EmailTemplateDto>(`/api/templates/${id}`),
    createTemplate: (req: EmailTemplateUpsertRequest) =>
      request<EmailTemplateDto>("/api/templates", {
        method: "POST",
        body: JSON.stringify(req),
      }),
    updateTemplate: (id: string, req: EmailTemplateUpsertRequest) =>
      request<EmailTemplateDto>(`/api/templates/${id}`, {
        method: "PUT",
        body: JSON.stringify(req),
      }),
    deleteTemplate: (id: string) =>
      request<void>(`/api/templates/${id}`, { method: "DELETE" }),
    previewTemplate: (req: TemplatePreviewRequest) =>
      request<TemplatePreviewResponse>("/api/templates/preview", {
        method: "POST",
        body: JSON.stringify(req),
      }),

    listCompanies: () => request<CompanyDto[]>("/api/companies"),
    getCompany: (id: string) => request<CompanyDetailDto>(`/api/companies/${id}`),
    createCompany: (req: CompanyUpsertRequest) =>
      request<CompanyDto>("/api/companies", {
        method: "POST",
        body: JSON.stringify(req),
      }),
    updateCompany: (id: string, req: CompanyUpsertRequest) =>
      request<void>(`/api/companies/${id}`, {
        method: "PATCH",
        body: JSON.stringify(req),
      }),
    deleteCompany: (id: string) =>
      request<void>(`/api/companies/${id}`, { method: "DELETE" }),
    createProject: (companyId: string, req: ProjectUpsertRequest) =>
      request<ProjectDto>(`/api/companies/${companyId}/projects`, {
        method: "POST",
        body: JSON.stringify(req),
      }),
    updateProject: (id: string, req: ProjectUpsertRequest) =>
      request<void>(`/api/projects/${id}`, {
        method: "PATCH",
        body: JSON.stringify(req),
      }),
    deleteProject: (id: string) =>
      request<void>(`/api/projects/${id}`, { method: "DELETE" }),
    getThreadAssociations: (threadId: string) =>
      request<ThreadAssociationsDto>(`/api/threads/${threadId}/associations`),
    linkThreadToCompany: (threadId: string, companyId: string) =>
      request<void>(`/api/threads/${threadId}/company/${companyId}`, {
        method: "POST",
      }),
    unlinkThreadFromCompany: (threadId: string) =>
      request<void>(`/api/threads/${threadId}/company`, { method: "DELETE" }),
    linkThreadToProject: (threadId: string, projectId: string) =>
      request<void>(`/api/threads/${threadId}/projects/${projectId}`, {
        method: "POST",
      }),
    unlinkThreadFromProject: (threadId: string, projectId: string) =>
      request<void>(`/api/threads/${threadId}/projects/${projectId}`, {
        method: "DELETE",
      }),

    aiStatus: () => request<AiStatus>("/api/ai/status"),
    summarize: (req: SummarizeRequest) =>
      request<SummarizeResponse>("/api/ai/summarize", {
        method: "POST",
        body: JSON.stringify(req),
      }),
    suggestReply: (req: SuggestReplyRequest) =>
      request<SuggestReplyResponse>("/api/ai/reply", {
        method: "POST",
        body: JSON.stringify(req),
      }),
    rewrite: (req: RewriteRequest) =>
      request<RewriteResponse>("/api/ai/rewrite", {
        method: "POST",
        body: JSON.stringify(req),
      }),

    listMembers: () => request<OrgMemberDto[]>("/api/org/members"),
    getAssignment: (threadId: string) =>
      request<ThreadAssignmentDto | null>(`/api/threads/${threadId}/assignment`),
    assignThread: (threadId: string, userId: string) =>
      request<ThreadAssignmentDto>(`/api/threads/${threadId}/assignment`, {
        method: "POST",
        body: JSON.stringify({ userId } satisfies AssignRequest),
      }),
    listNotes: (threadId: string) =>
      request<NoteDto[]>(`/api/threads/${threadId}/notes`),
    createNote: (threadId: string, body: string) =>
      request<NoteDto>(`/api/threads/${threadId}/notes`, {
        method: "POST",
        body: JSON.stringify({ body } satisfies NoteUpsertRequest),
      }),
    deleteNote: (id: string) =>
      request<void>(`/api/notes/${id}`, { method: "DELETE" }),
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
