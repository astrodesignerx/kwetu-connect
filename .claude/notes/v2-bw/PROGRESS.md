# Kwetu OS black and white rebuild: progress

Brief: C:/Users/ether/Documents/kwetu-connect/.claude/handoffs/20261109-0135-kwetu-os-unslop-bw.md
Branch: t3/0d3ac476 (worktree C:/Users/ether/.t3/worktrees/kwetu-connect/t3-0d3ac476), base d3a6221.

| Phase | Status | Commit |
|---|---|---|
| 1 Foundations | done | 8dced57 |
| 2 Navigation and actions | code done, screenshots not yet reviewed | see git log |
| 3 Words and formats | not started | |
| 4 Screens | not started | |
| 5 Schedule | not started | |
| 6 Motion | not started | |

Next: write .claude/notes/v2-bw/browser-check.mjs (copy of v2-everywhere plus the colour, 12 px and overflow assertions), review Phase 2 screens at 1440 and 390 in both themes, then Phase 3.

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

## Stopped 2026-11-09 10:12: disk below 1.5 GB

C: fell from 2.8 GB to 617 MB during Phase 2. The tools install added 14 MB; `C:/pagefile.sys` was rewritten at 10:09 and is 24.7 GB, so the page file grew. The user's rule for this run is to stop under 1.5 GB, so the dev server, browser check and Phases 3 to 6 have not started.

To resume: free space (3 GB or more), then continue from "Next" above in this worktree.
