# Kwetu OS black and white rebuild: progress

Brief: C:/Users/ether/Documents/kwetu-connect/.claude/handoffs/20261109-0135-kwetu-os-unslop-bw.md
Branch: t3/0d3ac476 (worktree C:/Users/ether/.t3/worktrees/kwetu-connect/t3-0d3ac476), base d3a6221.

| Phase | Status | Commit |
|---|---|---|
| 1 Foundations | done | 8dced57 |
| 2 Navigation and actions | not started | |
| 3 Words and formats | not started | |
| 4 Screens | not started | |
| 5 Schedule | not started | |
| 6 Motion | not started | |

Next: Phase 2 (rail, one primary per page, page header component, duplicates).

Known gaps carried from Phase 1 (fixed in later phases): a few TSX class names (emptyMail, newCard, trend, flightTiles, flightMark, mark, add, connect, conversationTools) have no module rule yet; they are replaced by the empty state, page header and screen work in Phases 2 and 4. Module rules nothing references yet are pruned at the end of Phase 4 with prune.mjs.

Tools here: `audit.mjs` (source audit), `prune.mjs` (dead module rules), `tw-sweep.py` and `p1-fixes.py` (Phase 1 one-off sweeps), `modcheck.mjs` (node modcheck.mjs mail-os/apps/web) checks CSS module classes used by TSX exist.

## Stopped 2026-11-09: disk below 2 GB

After the Phase 1 commit C: had 1.9 GB free (it was 2.5 GB when this run started; this job created no build output or browser downloads, so other work used the space). The brief says to stop and report under 2 GB, so Phases 2 to 6 have not started.

To resume: free space on C: (at least 3 GB is safer: one production build and a Playwright browser are still to come), then continue from Phase 2 in this worktree. Phase 1 checks at the stop: tsc clean, eslint clean, vitest 122 of 122 (one colour helper test removed with the helper), audit.mjs clean.
