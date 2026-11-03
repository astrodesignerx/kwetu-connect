# Kwetu Connect state

Goal: the KCA website (Next.js 16, Vercel) with a booking engine, stored bookings in Supabase, a staff manager area, and the concept C "Timetable" design for Book plays and the manager. Hard rules: booking sums stay as in `src/lib/booking` (KCA Screen Rulebook is the source of truth), public pages never expose other advertisers' details, no em dashes or middle dots in copy, never merge or push without the user's OK.

## Current status (2026-11-03)
- LIVE: `main` at `6a3165b` is pushed and deployed to https://kwetuconnectads.co.ke (Vercel project `kwetu-connect`, team `astrodesignerx-3017's projects`). It includes job 1 (engine, `/book`), job 2 (stored bookings, `/manage`), the Services price fix, and the Timetable redesign. Checked after deploy: `/`, `/book`, `/services`, `/manage/sign-in` (real staff sign-in, not demo) and `/book/occupancy` all return 200; occupancy returns shares only.
- Branches `ds/bookings-store` and `ds/timetable-redesign` are merged into `main` (fast-forward) and pushed; they can be deleted.
- Tests: 117 pass (101 original, 16 new). `tsc` passes. Production build passes in memory mode. ESLint has one older error in `src/components/CampaignTheater.tsx` (setState in an effect), not from this work.
- Browser-checked locally in memory mode: `/book` at 1280 and 375 px (no sideways scroll, price pinned on phones, cell toggles change the price, closed cells not focusable); a full run Quote to Paid (payment note) to advert upload and approval to Approved, with history rows; Week view shows the booking's sold share (Saturday morning 4%).
- Not yet done: a real staff sign-in test on the live domain with `admin@kwetuconnectads.co.ke`.

## Decisions
- Concept C Timetable chosen 2026-11-03 (over A Signal, B Sentence, D Site). Canvas: https://claude.ai/artifact/7tD1MAVVnTDVzbtPoMGykt, master files `.claude/artifacts/kca-redesign-concepts/`, brief `.claude/notes/redesign-brief.md`, build brief `.claude/handoffs/20261103-timetable-redesign.md`.
- A booking is chosen days times chosen time blocks (engine model unchanged); grid selection rules live in `src/lib/booking/selection.ts`.
- Busy shading: `occupancyByDayBlock()` in `src/lib/booking/occupancy.ts` and `store.occupancy()`; public grid shows Busy at 60% sold or more; manager heat levels under 40%, 40 to 79%, 80% or more.
- Sign-in uses email links with `token_hash` (`verifyOtp` in `src/app/manage/auth/callback/route.ts`) so links work in any browser; Supabase "Magic link or OTP" template links to `{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=email`.
- Server actions with per-action staff checks; memory mode (demo) only when all three Supabase variables are missing.
- Codex builds (OpenCode Go key expired; GLM-5.3 Flash free still reviews).

## Live setup
- Supabase project "Kwetu Connect Ads", ref `xmpxixlbdykfhdzxqguh`: migrations 0001 and 0002 applied; staff row and Auth user for `admin@kwetuconnectads.co.ke`; advert bucket 50 MB, MP4/PNG/JPEG; custom SMTP via Resend (`no-reply@kwetuconnectads.co.ke`); Site URL `https://kwetuconnectads.co.ke`; redirect URLs for the live domain, `http://localhost:3000` and the old preview.
- Adding staff: a `staff` row (lowercase email, name) AND a Supabase Auth user (Authentication, Users, Add user, Create new user, Auto Confirm).
- Vercel env (Production and Preview): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, plus the contact-form `RESEND_API_KEY`, `CONTACT_TO_EMAIL`, `CONTACT_FROM_EMAIL`. Local copy in `.env.local` (never commit).
- Local dev server: `.claude/launch.json` name `kwetu-site-dev`, port 3002. To test in demo mode, rename `.env.local` aside and restore it after.

## Open questions
- Retest staff sign-in on the live domain (blocking real use of `/manage`).
- Fix or leave the older ESLint error in `CampaignTheater.tsx`.
- Rulebook section 12 sign-off and decision 7 (play log export) still open.

## Sources
Briefs and reviews in `.claude/handoffs/` (job 2: `20261027-2300-bookings-store.md`; Timetable: `20261103-timetable-redesign.md`, Codex report `20261103-timetable-redesign-result.md`, GLM review `20261103-review-timetable-glm.md` with findings in `.scratch/REVIEW.md`). Supabase checklist: `.claude/notes/supabase-setup-checklist.md`.
