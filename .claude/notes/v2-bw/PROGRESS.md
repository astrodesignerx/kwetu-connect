# Kwetu OS black and white rebuild: progress

Brief: C:/Users/ether/Documents/kwetu-connect/.claude/handoffs/20261109-0135-kwetu-os-unslop-bw.md
Branch: t3/0d3ac476 (worktree C:/Users/ether/.t3/worktrees/kwetu-connect/t3-0d3ac476), base d3a6221.

| Phase | Status | Commit |
|---|---|---|
| 1 Foundations | done | 8dced57 |
| 2 Navigation and actions | done | 06e8ade, review fixes 1d6d126 |
| 3 Words and formats | done | see git log |
| 4 Screens | not started | |
| 5 Schedule | not started | |
| 6 Motion | not started | |

Next: Phase 4 (reader header, summary button, settings list, filler charts, shared empty state, native controls, new template form).

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

## How to check

- Build and serve with fixture env (PowerShell, from mail-os/apps/web): `$env:API_URL="http://127.0.0.1:59999"; $env:NEXT_PUBLIC_API_URL="http://127.0.0.1:3024"; $env:NEXT_PUBLIC_HUB_URL="http://127.0.0.1:3024"; pnpm.cmd build`, then `next start -p 3024 --hostname 127.0.0.1` with the same API_URL.
- From the repo root: `node .claude/notes/v2-bw/browser-check.mjs` (CHECK_ROUTES, CHECK_SCENARIOS, CHECK_WIDTHS, CHECK_THEMES, CHECK_REPORT narrow it; CHECK_DEV=1 adds /dev/mail, which only exists under next dev). Screenshots land in `.claude/notes/v2-bw/screenshots` and are not committed.
- Stop port 3024 and delete `mail-os/apps/web/.next` after each check.
