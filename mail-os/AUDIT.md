# Kompanion System Audit — 2026-09

Scope: full repo (`apps/api`, `apps/web`, `packages/types`, `packages/api-client`, `apps/desktop`, `infra`, jobs/tests). Method: three parallel deep code reviews (API security, mail engine, frontend/desktop), my own pass over `Program.cs` / config, plus a real build and test run.

**Build/test status:** `apps/api` builds clean. Web production build compiles and typechecks. The
integration suite is green: **139/139 passed** after Postgres was left running (the earlier 139-failure
run was Postgres dying mid-suite, not code — every failure was `connection refused to 127.0.0.1:5432`).
The PG log did show a stray `relation "hangfire"."schema" does not exist` probe worth investigating.

---

## Fixes applied after this audit (same session)

All six P0 items are fixed, plus several P1s that were cheap to do correctly while in the code.

| # | Finding | Fix | Verified by |
|---|---------|-----|-------------|
| 1 | Cross-org reply IDOR | `MailComposer` resolves `ReplyToThreadId` through the caller's org (`MailThread.MailboxConnection.User.OrganizationId`); a foreign thread is a 404, indistinguishable from missing. Reply context can no longer leak subject/sender/References. | New test `OrgScopingTests.Replying_to_another_orgs_thread_is_rejected` (returns 404; without the gate it would reach SMTP and 502) |
| 2 | Demoted admin keeps admin JWT | `AdminController.UpdateRole` bumps `User.TokenVersion` and invalidates `TokenVersionCache` **when the role actually changes**; a no-op PATCH does not sign the user out. | New tests `Demoting_an_admin_revokes_their_existing_session`, `Re_applying_the_same_role_keeps_the_session` |
| 3 | Stored XSS in the rich-text editor | New `apps/web/src/lib/sanitize-html.ts`: DOMParser allowlist sanitizer (tag allowlist, per-tag attribute allowlist, all `on*` dropped, URL scheme check that defeats `java\tscript:`, `style` scrubbed of `expression(`/`@import`, comments dropped, unknown tags unwrapped). Wired into the editor's single ingest point (`editor.tsx`), the one place stored HTML becomes live DOM in the app origin. Merge-field chips (`data-mf`, `contenteditable`, `class`) survive. | 17 payload cases (onerror quoted/unquoted, javascript: href, tab-split scheme, svg, script, iframe, `expression()`, HTML comment, unknown wrapper, chip round-trip, formatting, data: image, http href + `rel`) run in real Chromium against the compiled module — all PASS |
| 4 | Draft destroyed before SMTP send | Deletion moved after `SmtpSender.SendAsync` returns; the draft and its staged attachment rows are removed in one `SaveChangesAsync` only on success, so a failed send leaves the composed content recoverable. A supplied `DraftId` is now also consumed on reply sends (previously the `else if` skipped it and orphaned the row). | Existing 139-test suite still green (no send-path regression); logic reviewed against the controller's 502 path |
| 5 | Sent-copy contradiction (`SmtpSender` appended a copy while AGENTS.md claimed cPanel auto-saves) | Neither claim is trusted now: after SMTP accepts the message, `SmtpSender` searches the Sent folder for the outgoing `Message-ID` and appends only when the host did not already file one. `Mail:FileSentCopy=false` disables the append. Ingest additionally dedupes on `(folder, Message-ID)` from the envelope, so a duplicate costs no body fetch and no `\Seen` side-effect. AGENTS.md corrected. | Code + docs; the live host is the only place left to confirm which branch fires (logged either way at Information) |
| 6 | Sent drafts never consumed | `compose.tsx` passes `latest.current.draftId` on send instead of a hard-coded `null`, so `/drafts` stops accumulating already-sent mail. | Typecheck; server side covered by the P0-4 change |

**Also fixed** (P1 items that were one-liners or tightly coupled to the above): attachment blobs are now
verified to exist *before* a send instead of being silently skipped; the send response returns the real
wire `Message-ID` instead of a freshly invented one; `ResolveSentFolderAsync` enumerates a namespace with
`GetFoldersAsync` (the old `GetSubfoldersAsync` on an unopened root threw and dropped the copy) and matches
the leaf name `Sent` exactly (`Contains("sent")` also matched "Unsent Messages"); the nightly blob sweep
skips blobs written in the last 24 h so it cannot delete a blob whose row has not committed yet; flag
reconciliation compares flags as sets instead of order-sensitive sequences; the `From` display name is the
mailbox owner rather than a recipient address copied out of `ReplyToAddress`.

**Not yet done** — the remaining P1s from the table below: expunge/removal reconciliation, `SyncState`
stuck-`Backfilling` recovery, the `ImapClient` leak on failed connect, `SetThreadReadAsync` not holding the
mailbox gate, frontend 401 handling, SignalR restart after terminal close, `thread-counts` invalidation,
`ThreadLinker` project linking, draft attachments on resume, and the desktop items (load-failure fallback,
update story, "Show images" CSP). The P2 list is untouched.

---

## P0 — as originally reported (all fixed above)

1. **Cross-org IDOR in reply resolution** — `apps/api/Services/Mail/MailComposer.cs:119-137`. With `ReplyToThreadId`, the latest message is loaded by thread id only (no org filter). A member can reply to another org's thread and read back its subject, last sender address, and Message-ID chain — supposedly invisible data. **Fix:** resolve the thread through the same org scope as `LoadThreadInOrgAsync`; 404 otherwise.

2. **Demoted admin keeps admin powers up to 7 days** — `apps/api/Controllers/AdminController.cs:50-77`. `UpdateRole` never bumps `User.TokenVersion`; role lives in the JWT and `[Authorize(Roles="Admin")]` trusts it. **Fix:** on role change: `target.TokenVersion++` + invalidate `TokenVersionCache`.

3. **Stored XSS via unsandboxed editors** — `apps/web/src/components/editor.tsx:127-133` renders server-stored HTML (`el.innerHTML = html`) into a contenteditable in app origin; `/settings/templates` and `/settings/brand-kit` are `[Authorize]` (any member, not admin). Handlers in stored HTML actually execute; combined with the `ccos-auth` localStorage JWT this is a token-theft path (the *preview* frames are properly sandboxed — only the editing surface isn't). **Fix:** sanitize on ingest (DOMPurify allowlist, preserving `mf-chip`/`data-mf`) or sandbox-iframe the editor. Related: JWT-in-localStorage — move to in-memory or httpOnly once the injection is closed; consider `accessTokenFactory` for the hub and stop logging hub query strings.

4. **Draft destroyed before the SMTP send** — `apps/api/Services/Mail/MailComposer.cs:150-153`. The draft row is deleted *before* `SendAsync`; any SMTP failure (502) permanently loses composed content. **Fix:** send first, delete atomically after success.

5. **Sent-append vs cPanel auto-save contradiction** — `apps/api/Services/Mail/SmtpSender.cs:149-174` appends a Sent copy; AGENTS.md and `MailComposer`/`MailSyncJobs` are written assuming cPanel auto-saves (and must not double). Ingest dedupes only by `(folder, uid, uidvalidity)` — no Message-ID check — so if the server does auto-save, every send produces **two** Sent copies (doubled counts, duplicate bubbles, duplicate attachment rows). **Action:** verify live on the real host; keep exactly one filing path, and add the unique index `(MailboxConnectionId, MessageId)` + conflict-do-nothing upsert as the safety net regardless.

6. **Sent drafts never consumed (frontend)** — `apps/web/src/components/compose.tsx:276-292` always sends `draftId: null`; the server only deletes a draft when `DraftId` is supplied. `/drafts` fills with already-sent mail. **Fix:** pass `draftId` on send (and during close-with-save fixes the backdrop-race duplicate drafts too).

## P1 — Fix soon (correctness / reliability)

**Mail engine** (`apps/api`):
- **Blob sweep vs in-flight writes** — blobs are written before their row commits (ingest batches up to 100 messages; uploads); the nightly sweep's `liveKeys` can eat a just-written blob, corrupting a committed reference forever. Fix: skip blobs with `LastWriteTimeUtc` newer than ~24 h in `AttachmentStore.DeleteUnreferenced`.
- **No expunge handling** — server-side deletions/moves-by-other-clients leave stale rows forever. Reconcile against the summary set.
- **SyncState stuck "Backfilling"** — `SyncMailboxCoreAsync`'s work try has no catch; `IdleWorkerService` only manages state == `Syncing`, so a failed rebuild silently abandons the mailbox. Mirror the connect-failure error path.
- **ImapClient leak on failed connect** — the client constructed inside `ImapConnectionFactory` isn't disposed when connect/auth throws; the IDLE 1-min retry loop amplifies it after outages.
- **Silent attachment loss on send** — `SmtpSender` skips attachments whose blob is missing (`continue`) and still returns 200. Fail fast before sending.
- **Flag rhythm** — reconciliation uses order-sensitive `SequenceEqual` (spurious writes whenever server keyword order shifts); `SetThreadReadAsync` write-back doesn't hold the `MailboxSyncGate`, so a concurrent sync can bounce flags back.
- Reply helper items: send response returns `ComposeMessageId`, not the actual sent Message-ID; `ResolveSentFolderAsync` fallback `Contains("sent")` can match "Unsent" folders; the namespace-root listing path needs the parent opened.
- Minor: per-cycle `CancellationTokenSource` leak per IDLE cycle; threading rebuild's per-thread UPDATE loop + giant `IN (...)` (chunk it); `From: <recipient-address>` misused as display name.

**Frontend:**
- **No global 401 handling** — revoked tokens leave a zombie UI; wire an `onUnauthorized` hook (logout + redirect).
- **SignalR never restarts after terminal close** — `withAutomaticReconnect` gives up after ~4 tries; add a bounded-backoff reconnect loop.
- **Rail badge counts never invalidating on hub events** — add `["thread-counts"]` to the `threadsChanged` handler.
- **ThreadLinker can never link a project** — renders only already-linked list; needs candidate list comparison.
- **Resumed drafts lose attachments** — persist staged attachment ids with the draft and rehydrate on resume.
- **Desktop**: no `did-fail-load` fallback (blank window when the dev server/export origin is down); no update story (document manual distribution or wire electron-updater); "Show images" can never work under the desktop CSP — either allow remote images for opt-in or hide the button in desktop.

## P2 — Policy/debt (decide, then fix)

- **Permissioning**: any member can rewrite the org-wide brand kit/templates HTML (unaudited). Add `[Authorize(Roles="Admin")]` on writes (or audit-log per AGENTS.md if deliberate).
- **Mailbox connect SSRF-ish**: `MailboxesController.Connect` accepts arbitrary hosts/ports from any member with distinct error strings — restrict to admins or validate hosts.
- **Rate-limit IP keying is proxy-blind** (`Program.cs:150`): dev/proxy setups collapse all users into one 10/min bucket; add ForwardedHeaders with a known-proxy allowlist when a proxy exists.
- **Invitation single-use race** and **username-change unique-violation → 500**: add an `AcceptedAt IS NULL`-style guarded update / map unique violations to 409.
- Negative `page` → Postgres OFFSET error → 500: clamp.
- `AiAssistant` truncates bodies on tracked entities: use `AsNoTracking` before any future `SaveChanges`.
- Desktop devtools toggle in prod build: gate behind `isDev`.
- `apps/web/drafts` only lists `mailboxes[0]`'s drafts; company index create/delete not wired to React Query properly; L5/L6 gaps (`hasRemote` regex, missing DTO mirrors, stale `user-{id}` hub group, no AbortSignal/timeout in api-client, presence snapshot on reconnect).

## Docs bugs (AGENTS.md)
- **Sent-append contradiction (P0 #5)** — update whichever is wrong after live verification.
- Dashboard/notes unused `user-{id}` group claims stale; Next 16 `proxy.ts` note vs actual `rewrites()` in `next.config.ts` (fine as-is, but AGENTS mentions `middleware is proxy.ts` while this config correctly uses rewrites — keep the note consistent).

## Verification hygiene (from this run)
- Re-run the Postgres-backed suite; investigate the hangfire-schema probe error in the PG log.
- `turbopack.root` warning: Next ignored a `pnpm-workspace.yaml` from outside the repo root — set `turbopack.root` in `apps/web/next.config.ts`.

## Verified sound (for confidence)
- Org scoping on all other endpoints; admin override endpoints audited via `AuditService`; credentials only through Data Protection, never returned/logged; `JobStorage` resolve footgun respected at all call sites; JWT-key dev-placeholder refused outside Development; hub JWT restricted to `/hubs` paths; mail/preview iframes sandboxed with per-message CSP; desktop `contextIsolation`/`sandbox`/navigation-lock/path-guard all correct; DTO mirrors and SignalR payload↔React-Query key wiring match field-for-field; ports/proxy config consistent (3013/5280).
