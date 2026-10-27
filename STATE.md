# Kwetu Connect state

Goal: store bookings and implement the KCA manager area without changing the existing engine sums. Work is on `ds/bookings-store`, based on `d676310`.

Current status: Codex implementation is authorised directly for this session. This supersedes the earlier OpenCode blocker. No OpenCode jobs, merge or push are authorised or needed. Core store, migration and 50 new tests are implemented. Supabase adapter and selection are implemented. All 99 tests pass. Git commits are blocked because .git is read-only: git cannot create index.lock. Continue implementation without bypassing the restriction.

Decisions: server actions with per-action staff checks, protected route-group layout plus per-page checks, Supabase SSR email links, and atomic database changes for capacity and rate limits. Memory mode uses a process singleton and forgets data on restart. Public references use 64 random bits to reduce guessing; public responses contain no contact details. Existing engine sums stay untouched.

Checks outstanding: new tests, full test suite, build with no Supabase variables, changed-file lint, browser flows at desktop and 375 px. Use `pnpm.cmd`.

Source: user job 2 brief and `.claude/handoffs/20261027-2300-bookings-store.md`.
