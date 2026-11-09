# Kwetu OS black and white rebuild: progress

Brief: C:/Users/ether/Documents/kwetu-connect/.claude/handoffs/20261109-0135-kwetu-os-unslop-bw.md
Branch: t3/0d3ac476 (worktree C:/Users/ether/.t3/worktrees/kwetu-connect/t3-0d3ac476), base d3a6221.

| Phase | Status | Commit |
|---|---|---|
| 1 Foundations | done | 8dced57 |
| 2 Navigation and actions | done | 06e8ade, review fixes 1d6d126 |
| 3 Words and formats | done | 4ecb04e |
| 4 Screens | done | e95b661 |
| 5 Schedule | done | 61c096e |
| 6 Motion | done | see git log |

Next: rerun the full browser matrix (it stopped on a disk dip, see below), review the new captures, then the final report. All six phases are committed.

Known gaps carried from Phase 1 (fixed in later phases): a few TSX class names (emptyMail, newCard, trend, flightTiles, flightMark, mark, add, connect, conversationTools) have no module rule yet; they are replaced by the empty state, page header and screen work in Phases 2 and 4. Module rules nothing references yet are pruned at the end of Phase 4 with prune.mjs.

Tools here: `audit.mjs` (source audit), `prune.mjs` (dead module rules), `tw-sweep.py` and `p1-fixes.py` (Phase 1 one-off sweeps), `modcheck.mjs` (node modcheck.mjs mail-os/apps/web) checks CSS module classes used by TSX exist.

## Phase 2 notes

- Kept the Gemini run's three edits: rail items gained visible labels, and the topbar "New email" is primary only on Mail and Drafts (`primaryCompose`), quiet elsewhere.
- Rail: 84 px column, 68 x 56 px items, icon over a 12 px label, active item is a solid `--fg` fill. CSS in globals.css under "Rail".
- New `src/components/page-header.tsx`: context line (always reserved, so titles align), 28 px title, description, meta, action. `SettingsHeader` now wraps it. Used by Clients, client detail, Drafts, Templates, New template, template editor and every settings page. Pages that space children with a gap set `--page-header-gap: 0px`.
- New `buttonClass()` in ui.tsx for links that look like buttons.
- Removed: Drafts "New message" link, Mailboxes "Connect another mailbox", the extra "New template" tile, the template editor "Back" button (the "Templates" context link does that job), the client hero card (its title moved to the page header; the decorative avatar went with it).
- One primary per page: Templates "Edit template" and Profile "Change password" are now secondary. The header action on Templates and Mailboxes hides when the list is empty, so the empty state carries the only action.
- Compose close button is a 10 px square, not a circle.
- Browser tooling: `.claude/notes/v2-bw/tools` (playwright-core 1.65.0, own lockfile, installed with `pnpm.cmd install --ignore-workspace --frozen-lockfile`). Launch Chromium from `C:/Users/ether/AppData/Local/ms-playwright/chromium-1248/chrome-win64/chrome.exe`; do not download another.
- Checks at the Phase 2 commit: tsc clean, eslint clean, vitest 122 of 122, audit.mjs 0 findings. No screenshots yet.

## Phase 3 notes

- `src/lib/format.ts` (tests in format.test.ts): formatDate "8 Nov 2026", formatShortDate "8 Nov", formatWeekday "Sat", formatTime "11:00", formatDateTime, formatDateRange "14 Nov to 11 Dec 2026", formatWhen (list stamps), formatDuration "2d 12h" / "1h 0m", plural(). All dates show in Africa/Nairobi time, as displayDate already did; the audit log note now says so.
- Every ad hoc toLocale* call in the app now goes through it. Dates in meta rows sit in `<time>`, which is the single mono style.
- Copy: Login "Sign in", "Morning brief" with the date as meta, slogans removed, "No drafts", "No templates yet", one-sentence labels and messages lose their trailing period (multi-sentence messages keep theirs), slash machine labels rewritten in words, plurals through plural().
- One-off sweep scripts: p3-*.py in this folder.
- Tests changed (copy only): drafts-page.test.tsx "3 saved, 1 ready to send"; client-directory.test.tsx "No clients match that search"; mail-screens.test.tsx heading "Morning brief".

## Phase 4 notes

- Reader: subject, quiet "Summarise thread" button, then one sender row (36 px avatar, name, address, Reply / Mark unread / Archive / Delete / Details). The latest message card no longer repeats the sender; earlier messages keep theirs.
- Settings hub is a list of six rows with a real one-line status each, under one workspace line with the counts. Mailbox hour chart, audit heatmap and team avatars are gone from the hub.
- Charts only with data: Mailboxes hour chart needs 3 busy hours, the audit heatmap 3 active days; otherwise a sentence. Client card sparklines removed. Clients stat cards folded into the header line.
- `src/components/empty-state.tsx`: EmptyState (icon, title, one line, one action; `bare` inside cards) and ErrorState (alert icon, exact message, Try again). Used by Mail, Drafts, Templates, Clients, Mailboxes, SettingsState, client detail, template editor, morning brief. Inline errors use ErrorText (alert icon).
- With no mailbox connected, "New email" is quiet and "Connect a mailbox" is the primary.
- Text characters as icons replaced with lucide (X, Plus, Check, Circle, CircleAlert). New template lost its 01 / 02 numbers. Audit filters and rows regained their classes. Email appearance hex fields and HTML boxes use mono.
- Dead module rules pruned with prune.mjs.
- Browser check at the Phase 4 commit: 333 captures (1440 and 390, both themes, all four states, overlays), 0 failures.

## Phase 5 notes

- The flight plan (`src/components/signal/campaign.tsx`, styles under "The flight plan" in signal.module.css) is a six-week sheet: a solid `--fg` baseline under the header, week hairlines with day ticks, a "Site" column, solid `--fg` bars with `--surface` mono text that ellipsis, flat bar ends when a flight starts before or runs past the window, and one Today line with its own label lane (the label flips left near the right edge).
- At 600 px and below it fits the width with no sideways scroll: 96 px site column, every other week labelled.
- Client KPIs become compact label and value rows on phones.
- `flight-shot.mjs` screenshots the plan alone with a long site name and two clipped flights (needs the 3024 server).
- Morning brief go-lives are plain rows (done in Phase 4). No new cards, no LED effects.

## Phase 6 notes

- Loops: only busy spinners spin (Loader2, `.signal-loading`). The status ping, skeleton breathing and presence pulse were already gone after Phase 1. The LED marquee and blinking dots remain only in `components/signal/boards.tsx`, which only the dev gallery uses.
- Entrance: `main.signal-canvas` gets `data-enter=true` only on the first shell mount in a tab (module flag in app-shell.tsx), so the content rises in once and section changes cut straight to the page. Charts, flight bars and empty states no longer animate on mount. User-triggered open and close (dialogs, drawer, popovers, disclosures, compose, attachments) keep their transitions; reduced motion still cuts to the end state.
- Hover lift only on link cards (client tiles and rows). Dead stagger styles removed.
- The browser check now asserts the entrance plays on first load, does not replay after navigating, and that an idle page has no infinite animation.

## How to check

- Build and serve with fixture env (PowerShell, from mail-os/apps/web): `$env:API_URL="http://127.0.0.1:59999"; $env:NEXT_PUBLIC_API_URL="http://127.0.0.1:3024"; $env:NEXT_PUBLIC_HUB_URL="http://127.0.0.1:3024"; pnpm.cmd build`, then `next start -p 3024 --hostname 127.0.0.1` with the same API_URL.
- From the repo root: `node .claude/notes/v2-bw/browser-check.mjs` (CHECK_ROUTES, CHECK_SCENARIOS, CHECK_WIDTHS, CHECK_THEMES, CHECK_REPORT narrow it; CHECK_DEV=1 adds /dev/mail, which only exists under next dev). Screenshots land in `.claude/notes/v2-bw/screenshots` and are not committed.
- Stop port 3024 and delete `mail-os/apps/web/.next` after each check.

## Stopped 2026-11-09: disk dipped below 1.5 GB during the final browser run

The final production build passed (`build.txt`). The full matrix (1440, 1280 and 390, both themes, four states, then overlays, reduced motion, motion and contrast) stopped itself after 198 captures, because the run checks free space before every capture and C: briefly read under 1.5 GB. A minute later C: had 13.95 GB free again, so something outside this job used and released about 12 GB. The 198 captures (clients, client detail, drafts, settings, profile, mailboxes, connect, part of brand-kit) had 0 colour, 0 small-text and 0 overflow failures, no console errors and no requests outside the fixture. Port 3024 is stopped and `.next` is deleted.

To resume: confirm C: has space, build and serve as under "How to check", then run `CHECK_ROUTES=brand-kit,templates,template-new,template-edit,admin-users,admin-audit,login,register,mail,overlays,reduced-motion,motion,contrast node .claude/notes/v2-bw/browser-check.mjs` from the repo root, rebuild the contact sheets with `python .claude/notes/v2-bw/contact-sheets.py`, and review them. The Phase 4 run already covered every route at 1440 and 390 in both themes with 0 failures (333 captures); what is outstanding is 1280 px and the new motion assertion.
