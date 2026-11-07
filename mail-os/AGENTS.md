# Kwetu OS - Agent Notes

Internal webmail replacement for Kwetu Connect Ads. Single-organization internal tool
(not multi-tenant SaaS). Employees' cPanel-hosted mailboxes sync over IMAP/SMTP into one
project-centric platform. Build proceeds in numbered phases; **Phase 0 (spike),
Phase 1 (foundation), Phase 2 (mail engine), Phase 3 (compose & send), Phase 4
(brand kit & templates), Phase 5 (client workspace), Phase 6 (AI assistant),
Phase 7 (team collaboration), and Phase 8 (desktop packaging) are complete**.
Phase 9 (deferred) is next per the spec.

## Repo layout

- `apps/api` — ASP.NET Core 10 Web API (JWT auth, EF Core + Npgsql, MailKit, Data Protection).
- `apps/web` — Next.js 16 (App Router, Turbopack), TypeScript, TailwindCSS v4, React Query, Zustand.
  **Read `node_modules/next/dist/docs/` before assuming Next conventions — Next 16 has breaking changes
  (e.g. middleware is now `proxy.ts`, fetch is uncached by default).**
- `packages/types` — shared DTO types (mirrors `apps/api/Models/Dtos.cs` by hand; OpenAPI generation planned).
- `packages/api-client` — typed fetch client used by the web app (future React Native reuses both packages).
- `tools/MailSpike` — Phase 0 spike console app (IMAP backfill, JWZ threading, seed/clean). Its ingest and
  threading code graduates into the Phase 2 sync worker.
- `infra` — schema.sql (spike), portable PostgreSQL 17.5 (`infra/postgres`, `infra/pgdata`, gitignored),
  `infra/dpkeys` (Data Protection key ring, gitignored).

## Running locally (Windows)

1. Postgres: `Start-Process infra/postgres/bin/postgres.exe -ArgumentList '-D','infra/pgdata','-p','5432' -WindowStyle Hidden`
   (dev login postgres/postgres; databases `clientcomms` and `mailspike` already exist)
2. API: `dotnet run --project apps/api` → http://localhost:5280 (migrations + org seed run on startup)
3. Web: `pnpm --filter web dev` → http://localhost:3013 (proxies /api/* and /hubs/* to 5280, so no CORS)
4. EF migrations: `dotnet ef migrations add <Name> --project apps/api --startup-project apps/api`
   (dotnet-ef is a repo-local tool: `dotnet tool restore` if needed)
5. Tests: `dotnet test apps/api.tests` — integration tests against a real throwaway
   Postgres database (step 1 must be running). Each test class creates and drops its own
   `clientcomms_test_<guid>`; no in-memory provider, because the schema depends on
   Postgres-only features (stored generated tsvector, jsonb, GIN).

Prefer `pg_ctl` over `Start-Process postgres.exe` — `pg_ctl -w` waits for readiness and
writes a log, so a failed start is visible instead of silent.

## Non-negotiable conventions

- **Design tokens only**: brand-amber #FBB040, brand-yellow #F9ED32 (sparingly), brand-black #171717,
  brand-cream #FEFBD2, defined in `apps/web/src/app/globals.css`. Glass surfaces via `.glass-panel` etc.
  Never use default Tailwind gray/blue or generic shadcn styling. Local primitives in
  `apps/web/src/components/` follow the shadcn pattern (component code in-repo, token-styled) instead of
  CLI-generated stock shadcn components — keep them coherent with the glass aesthetic.
- **Server-side scoping**: members may only ever query their own data (`MailboxConnection.UserId`); never
  rely on client-side hiding. Admin oversight endpoints always write an `AuditLogEntry` via `AuditService`.
- **Credentials**: mailbox passwords are only ever stored via `CredentialVault` (Data Protection).
  Never log them, never return them from any endpoint, never store in the frontend.
- JWT auth: the first registered account bootstraps the admin; every account after it
  needs an admin-issued invitation (`Invitations`, SHA-256 of the token only). 7-day
  tokens, revocable before expiry via `User.TokenVersion` — bump it and every existing
  session dies. Rate limits: 10/min per IP on login/register, 20/min per user on AI,
  60/min per user on uploads.
- **Read org and user id from the JWT claims** (`ClaimsExtensions.CallerOrgId()` /
  `CallerId()`), not by re-querying `Users` per request.
- **Attachments**: bytes live in the content-addressed blob store (`AttachmentStore`,
  SHA-256 keyed, sharded two levels), never in Postgres. Rows in `MailAttachments` point
  at a blob and hang off either a message (ingested) or an owner (staged for send). A
  nightly Hangfire sweep drops abandoned uploads and unreferenced blobs — never delete a
  blob inline with a row, since keys are shared. The sweep skips blobs written in the last
  24 hours, because a blob is always written before the row that references it is committed
  (ingest batches 100 messages; uploads insert after the write) and a sweep in that window
  would delete a live blob.

## Mail-host facts (learned in Phase 0, webmail.kwetuconnectads.co.ke = cPanel Dovecot/Exim)

- IMAP on `webmail.kwetuconnectads.co.ke:993` has a valid cert. SMTP must use the
  provider hostname its certificate is issued to (the documented cPanel host);
  TLS validation requires a valid chain and hostname, with no fallback.
- Fetching message bodies sets `\Seen` server-side even under read-only open — the sync code snapshots
  flags before fetching and restores `\Seen` after (see `MailIngestor.SyncFolderAsync`).
- cPanel auto-saves SMTP submissions to the Sent folder **on some configurations only** — it is not a
  protocol guarantee, and an earlier note in this file asserted it while `SmtpSender` asserted the
  opposite. Neither claim is trusted now: after the SMTP hand-off, `SmtpSender` searches the Sent
  folder for the outgoing `Message-ID` and appends its own copy only when the server did not already
  file one. `Mail:FileSentCopy=false` disables the append outright for a host whose behaviour is known.
  Ingest dedupes on `(folder, Message-ID)` as a second line of defence. Drafts live only in the local
  database; they are not pushed to the server's Drafts folder.
- Threading: JWZ over Message-ID/In-Reply-To/References + normalized-subject fallback
  (`ThreadBuilder`). **Thread ids are deterministic** — derived from `SHA-1(RootKey)` so the same
  thread keeps the same Guid across rebuilds and the UI can hold stable URLs.

## Startup footgun

`MailSyncJobs` and `AttachmentJobs` use Hangfire's **static** `RecurringJob` /
`BackgroundJob` APIs, which read `JobStorage.Current`. That static is only populated once
Hangfire's storage has been resolved from DI. `Program.cs` therefore resolves `JobStorage`
before scheduling anything — it looks like a no-op line, but deleting it makes startup
throw `JobStorage instance has not been initialized yet`.

## Sync engine architecture (Phase 2)

- **Sync worker** = `IdleWorkerService` (BackgroundService) — one IMAP IDLE session per syncing mailbox,
  9-minute IDLE cycles, NOOP keepalive via IDLE, reconnect-with-backoff. Polling fallback: Hangfire
  recurring job every 5 minutes per mailbox (`MailSyncJobs.ScheduleForMailbox`).
- **MailboxSyncGate** is a process-wide singleton of per-mailbox `SemaphoreSlim`s so the IDLE
  worker, Hangfire polling, and manual "sync now" cannot run two syncs for the same mailbox at once.
- **Backfill** is enqueued on connect, runs the same `MailIngestor.SyncMailboxAsync` core path as
  incremental sync (which is a no-op when there's nothing new once caught up). Always full-history
  per spec; UIDVALIDITY is checked and a folder is fully resynced if the server invalidates its UIDs.
- **Two-way flag write-back** lives in `MailActionService`: set-thread-read toggles `\Seen` on the
  server via `AddFlagsAsync` / `RemoveFlagsAsync`, then a sync reconciles the local copy.
  Move-to-Archive/Trash uses `IMailFolder.MoveToAsync` (UIDPLUS+MOVE) on Dovecot.
- **Search** is Postgres tsvector: generated column on `Messages` (`Subject` + `From` + `To` + `Body`)
  with a GIN index; queries use `websearch_to_tsquery`.
- **Live updates** to the web client use SignalR (`/hubs/mail`) with the JWT in the query string
  (browsers can't set headers on the WebSocket upgrade). The hub pushes `threadsChanged`,
  `mailboxSyncState`, `threadAssigned`, `threadNotesChanged`, and `presenceChanged`; the
  client invalidates React Query keys on receipt.

## Team collaboration architecture (Phase 7)

- **Shared inbox**. Every member of the org can read every thread synced into any connected
  mailbox in the org. Destructive actions (archive / move / delete / sync) still go through
  the connection that owns the thread — so an admin can't accidentally move mail in
  someone else's IMAP account. `GET /api/mail/overview` returns every active mailbox in
  the org; `GET /api/mail/threads` filters by `connectionId` (one mailbox at a time).
- **Assignment**. A thread has at most one assignee (`ThreadAssignments`, one row per
  thread). Every member can change the assignment; the org sees it. The reading pane
  has an "Assign" picker; the inbox has an "Assigned to me" filter chip; the list
  SignalR event `threadAssigned` invalidates the right queries.
- **Internal notes**. `ThreadNotes` (plain text, `Body`, `Author`, `CreatedAt`) live
  alongside the thread and are visible to every member of the org. They are never sent
  to the client — there is no SMTP path that reads them. Only the author (or an admin)
  can delete a note.
- **Presence**. The `MailHub` joins each new connection to a per-`org-{id}` group, tracks
  the set of live connections per user, and broadcasts `presenceChanged` to the org on
  connect / disconnect. The web sidebar shows an "N online" pill (excluding the caller).
- **Shared inbox in the UI** is visible to a member by virtue of the overview endpoint
  returning every mailbox; the threads list filters by `connectionId` so the picker
  still says "which mailbox" — the next natural step is an "all org mail" view that
  hides the picker, but Phase 7 ships the per-mailbox view and that's enough for a small team.

## Browser-only delivery (Phase 8 retired the desktop shell)

- **No native shell**: the Electron app at `apps/desktop/` was removed. Kwetu OS
  ships as a browser app only: the Next.js server (`apps/web/`, normal Node hosting
  with `/api/*` and `/hubs/*` rewrites to the ASP.NET backend) plus the ASP.NET
  Core API. There is no static export, no custom protocol, and no Electron
  packaging path.
- **API origins**: browser calls stay same-origin through the Next rewrites in
  development and in normal hosting. `Cors:WebOrigins` holds configurable browser
  origins only. The development SignalR connection goes directly to the API origin
  (see `apps/web/.env.development`).
- **History**: earlier phases verified an Electron window end to end, but that
  packaging path no longer exists. Historical audits (`.claude/notes/`,
  `AUDIT.md`) still describe it; they are records, not current instructions.

## Compose & send architecture (Phase 3)

- **Outbound mail** flows through `SmtpConnectionFactory` (valid chain and hostname
  required) → `SmtpSender`
  (builds `MimeMessage` with `Message-ID`, `Date`, `In-Reply-To`, `References`) → server.
  `MailComposer` resolves the reply context: for a `ReplyToThreadId` send, it looks up the
  latest message in the thread and sets `InReplyTo` to its `MessageId` and `References` to the
  chain `HeaderReferences` ∪ `[latest.MessageId]`. `To` and `Subject` default to the last
  sender and `Re: <original>` if the caller doesn't supply them.
- **After a send**, `MailSyncJobs.TriggerIncremental(connectionId)` queues a sync so the
  server's auto-Sent save appears in the UI within seconds. Dedup on `Message-ID` keeps the
  thread count correct.
- **Drafts** are local-only (table `MailDrafts`). Auto-saved on compose-modal close. The web UI
  has a `/drafts` view for resuming work. Send consumes the draft by `id` — the compose modal
  passes the autosaved row it owns, and `MailComposer` deletes it only *after* SMTP has accepted
  the message, so a failed send never destroys the only copy of what the user typed.

## Brand kit & templates architecture (Phase 4)

- **Brand kit** is a single row per organization (`BrandKits`) with name, primary/accent/text/background
  colors, logo URL, and three HTML fragments: header, footer, signature. Edited at
  `/settings/brand-kit`.
- **Email templates** are reusable outbound HTML with `{{variable}}` placeholders
  (`EmailTemplates`, with `VariablesJson` listing the declared variable names). Edited at
  `/settings/templates/[id]` with a live preview iframe. Created at `/settings/templates/new`.
- **Rendering**: `TemplateRenderer.Render` and `RenderBody` substitute `{{variable}}` with
  `HtmlEncode`-escaped values, then wrap the body in the brand kit (header above, signature
  after a hairline rule, footer at the bottom) unless the template sets `SkipBrandWrap`. The
  editor's preview and the send pipeline share the same renderer, so what the user sees is
  what the recipient gets.
- **Send pipeline integration**: `MailComposer.SendAsync` calls the renderer when the caller
  passes `bodyHtml`, so any HTML body sent via `/api/mail/send` is brand-wrapped on the way
  out. Variables in the body are substituted in the same pass; the caller's variable values
  flow in via the API request (or the compose modal's variables panel).
- **Compose modal**: a "Use template" picker (lists all templates), a live preview pane
  (desktop), a simple HTML editor with `{{variable}}` highlighting, and auto-save on close.

## Client workspace architecture (Phase 5)

- **Companies** (one row per client) and **Projects** (children of a company) live in
  `Companies` and `Projects`. The company row carries an optional `Domain` — used to
  auto-discover contacts whose email address matches that domain.
- **Thread ↔ company / project / contact** are many-to-many via `ThreadCompanies`,
  `ThreadProjects`, and `ThreadContacts`. Tagging a thread to a company also auto-links
  any contact whose email appears in the thread — the client view then shows the full set
  of people involved without manual tagging per person.
- **Server-side scoping**: every API path resolves the caller to their organization and
  filters on it; a thread, company, or project in another org is invisible.
- **API surface**: `GET/POST/PATCH/DELETE /api/companies`, `POST /api/companies/{id}/projects`,
  `GET /api/companies/{id}` (detail with project list, contacts, and a flat
  thread roll-up — directly linked + via any project), and `GET/POST/DELETE` on
  `/api/threads/{id}/associations` for tagging.
- **Web UI**: `/clients` (index with per-company thread/project counts), `/clients/[id]`
  (detail with three columns: projects, contacts, communication history), and a
  `ThreadLinker` widget inside the mail reading pane that lets the user tag a thread
  to a client and toggle which of the company's projects the thread also belongs to.

## AI assistant architecture (Phase 6)

- **Backend-proxied** LLM calls. The provider URL and key are server-side config
  (`LLM:BaseUrl`, `LLM:ApiKey`, `LLM:Model`, `LLM:TimeoutSeconds`); the API key never
  reaches the browser. The client only sees `GET /api/ai/status` to know whether AI
  actions are enabled.
- **OpenAI-compatible** request format (`POST {base}/chat/completions`) — works with
  OpenAI proper, OpenRouter, Groq, Together, Ollama, and any other OpenAI-shaped
  endpoint. Implemented with a small `LlmClient` wrapping `HttpClient` and `PostAsJsonAsync`.
- **Three actions**:
  - `POST /api/ai/summarize { threadId }` — last 20 messages (truncated per body), returns a
    3–6-bullet neutral summary suitable for catching up on a long thread.
  - `POST /api/ai/reply { threadId, tone? }` — drafts the next reply in Professional / Friendly /
    Concise tone; intended for the "Suggest reply" button on a reply compose.
  - `POST /api/ai/rewrite { body, tone }` — rewrites a body the user has typed in the
    requested tone; used by the "Rewrite in tone" button in the compose modal.
- **When no API key is configured**, the controller returns 503 with a clear
  `LLM:ApiKey not configured` message; the rest of the app keeps working.
- **Context-windowing** clamps inputs to the last 20 messages and per-body 4000 chars
  to keep prompt cost bounded; temperature is low (0.2–0.5) to keep outputs grounded.

## Deferred — do not build without explicit instruction

Gmail API, Microsoft Graph, XOAUTH2 (not needed — mailboxes are cPanel password auth), OpenSearch,
automation/triggers, analytics dashboards, WhatsApp/SMS/voice, SSO/compliance exports, tenant isolation,
RAG/knowledge-base AI (Phase 9+), Redis/SignalR backplane (single instance suffices at <25 mailboxes).
