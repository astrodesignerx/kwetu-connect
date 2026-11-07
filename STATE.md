# Kwetu Connect state

Goal: the KCA website, booking engine, Supabase bookings and staff manager. Next.js 16 on Vercel. Booking sums follow src/lib/booking and the KCA Screen Rulebook. Public pages never expose other advertisers' details. Use British spelling and no em dashes or middle dots in new copy. Merge, push and deployment require the user's authorisation.

## Current status (2026-11-07)

- Local V2 Job A is complete on ds/v2-ember-silver from a1862c0. Phases 1 through 4 are 1a74bce, ebf1655, 4b208e6 and b98d493. Phase 5 completes /book, Settings details, keyboard-accessible inspector tabs, phone navigation and composited theme changes. Final review fixes the 390 px advert preview overflow and the phone Overview banner overlap. Booking rules, prices, data, actions, auth and schema are unchanged. Money stays labelled as booked value because the store does not provide settlement totals. No merge, push or deployment is authorised for this job. Full phase hashes, file inventory, differences and command records are in .claude/handoffs/20261107-v2-job-a-result.md.
- Final checks pass: TypeScript, targeted ESLint, 157 tests in 15 files, production build and 172 browser assertions. All 48 page/width/theme combinations pass, plus eight state screenshots, with no browser exceptions or failed HTTP responses. The checked-advert report expands to show every check and action at all three widths in both themes. Evidence: .claude/notes/v2-build/checks.json, screenshots.md, commands.md and the screenshots/ and review/ folders. The isolated production demo on port 3028 is stopped after verification. This worktree has no .env.local, and none was created or copied. OpenCode cost is zero. Claude's separate craft audit follows the approved brief.

- LIVE: application release 66dd4c917a4fc2b49624ab9597133b526473ae80, feat: refine booking and manager workspaces, is committed, fast-forward merged from ds/nightshift-redesign into main, pushed and deployed to https://kwetuconnectads.co.ke. The user explicitly authorised this release. Main may include later documentation-only commits with identical application code.
- Vercel project kwetu-connect, team astrodesignerx-3017s-projects, GitHub repository astrodesignerx/kwetu-connect. Production deployment: https://vercel.com/astrodesignerx-3017s-projects/kwetu-connect/21sj3pjzRBWGj4ZYnbttfmMb4YCv. GitHub production deployment ID 7613089031. The Vercel commit status reports success.
- Supabase migrations 0001 through 0004 are applied. Migration 0004 was applied on 2026-11-07 in the signed-in SQL editor with a transaction and PostgREST schema reload. SQL checks returned ready=true, updates_prices=true and updates_cells=true. The service-role readiness RPC returns 200/true; anonymous access returns 401.
- Release checks passed: 157 tests in 15 source files, TypeScript, ESLint on all changed TypeScript/TSX files since 2706c4b, whitespace checks, and a production build in the main checkout with its real Supabase configuration. Install used pnpm.cmd install --frozen-lockfile in non-interactive CI mode.
- Live HTTP checks passed for /, /book, /book/find, /services, /manage/sign-in, three booking CSS assets and /book/occupancy. Manager routes redirect to sign-in, including requests carrying the demo cookie. Public occupancy contains no private advertiser fields. These are response checks, not real-user acceptance.
- Pipeline was browser-checked locally in demo mode at 1440 and 390 px in both themes, including reduced motion, focus restoration, status changes, advert decisions and CSV downloads. Real stored-media playback, live staff sign-in and booking recovery email delivery remain unverified.
- Evidence: .claude/handoffs/20261107-production-release.md, .claude/notes/release-build.log, release-lint.log, release-health.json, release-readiness.mjs. No OpenCode job ran; OpenCode spend was zero.

## Accepted design and behaviour

- Night Shift and Daylight are the current theme controls. The local V2 Ember Silver candidate maps them to ember graphite and brushed silver, superseding the Pipeline appearance in this branch. Production remains on Pipeline. Earlier concepts remain in .claude/artifacts/kca-redesign-concepts/ and .claude/notes/redesign-brief.md. The approved V2 source is C:/Users/ether/Documents/kwetu-connect/.claude/artifacts/manager-redesign/.
- Bookings has Quote, Paid, Approved, Live and Finished columns, a separate Cancelled group, real totals, search/date/status filters, full inspector and confirmed drag moves. Existing payment, capacity, advert and date rules still govern transitions. Payment notes, contact details, uploads, answers, sums and history remain accessible.
- /manage/adverts is a dedicated review desk with waiting, approved, refused, missing and all queues, private media previews, measured shape/duration checks, refusal reasons, missing-file uploads and status controls. The legacy bookings?adverts=1 URL redirects. Unmeasured values are labelled.
- Schedule reads generated playlist entries for compact week bars, expandable booking names and an expandable Nairobi today timeline. Raw rows, playlist entries and CSV downloads remain available. All scheduling/playback figures are planned, never measured playback. Overview keeps the booking count beside Live and Open playlist in its header.
- /book uses a two-tap range calendar, advert drop tile, single-box hour picks, budget suggestions and a compact quote with plan tiles, week strip, discount ladder, below-minimum fixes and price breakdown. The timetable heading shows the selected frequency. The advert icon turns green after checks pass. Prices remain VAT-inclusive; there is no visible week-strip legend or extra discount-ladder message. Settings uses summary tiles and a side editor.
- A booking is a set of day/time cells, such as 6-morning. days and blocks are their unions. A legacy booking without cells still means every selected day at every selected block. Rules: src/lib/booking/selection.ts and bookedHours() in hours.ts. Pricing formulas are unchanged.
- Customers can attach an advert before saving. Upload runs after the quote saves, so upload failure never loses the booking. Browser checks target the 768 x 432, 16:9 silent screen. Public busy shading starts at 60% sold; manager heat bands are below 40%, 40 to 79%, and at least 80%.
- Returning customers have booking links, browser-local Your bookings, reference-plus-phone recovery, email links and progress. Editing an unpaid plan preserves its reference, retains files for review and refuses a recorded payment note. An unconfirmed payment still requires contacting KCA. The Pay first, recap second payment view keeps M-Pesa/card instructions, recap and WhatsApp links. The Paybill account uses the first 12 reference characters, matched by staff search.

## Services and local servers

- Supabase: Kwetu Connect Ads, ref xmpxixlbdykfhdzxqguh. Staff row and Auth user: admin@kwetuconnectads.co.ke. Advert bucket: 50 MB, MP4/PNG/JPEG. Resend SMTP sender: no-reply@kwetuconnectads.co.ke.
- Production/Preview env names: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY, CONTACT_TO_EMAIL, CONTACT_FROM_EMAIL. The main checkout's .env.local contains local credentials, never committed or copied into shared notes.
- Staff sign-in uses token_hash and verifyOtp for cross-browser email links. Supabase template: {{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=email. Site URL is the production domain; redirects include its manager callback, localhost:3000 and the old preview. New staff need both a lowercase staff row and an Auth user.
- Pushing main triggers Vercel production deployment. The local Vercel CLI is logged out; GitHub deployment/status APIs work.
- Dev: http://localhost:3005 from C:/Users/ether/.t3/worktrees/kwetu-connect/t3-45ed95a0, synthetic demo bookings, no worktree .env.local. Restarted 2026-11-07. Book, Bookings and Adverts return 200. The existing launcher respawned it; an extra manual launch hit EADDRINUSE. Active launcher and health: .claude/notes/dev-3005.pid and dev-3005-health.json.
- Separate isolated production demo preview: http://localhost:3018/manage/bookings, source .claude/notes/pipeline-preview/. Demo sign-in only, no copied credentials. It predates four final quote-style refinements. The checked-in .claude/launch.json defaults to port 3002.
- Windows commands use pnpm.cmd. Source tests: pnpm.cmd exec vitest run --exclude '**/.scratch/**'. The redesign worktree's ignored .scratch/revisit-app has duplicate tests; unrestricted discovery inflates the count. Shared artifacts, handoffs and notes belong in this checkout's .claude folders.
- Unrelated .ignore and graft/ files were preserved. A release-owned Git stash preserves the previous canonical STATE.md, object da85709c55ba49b5b29811f9e33ff55658357df8.

## Billboard control

- NovaStar TB10 Plus player T10Plus_00003191, hotspot 192.168.41.1; 12 cabinets, 4 x 3, NV7508 cards. Average 4.32 kW, maximum 12.48 kW. Vendor kit: D:/Design/Kwetu Connect Advertising/software for 12 sets of outdoor led display.
- Installed: ViPlex Express 4.0.0.4401 and NovaLCT 5.9.1. Decompiled local API: HTTPS 16674, /terminal/core/v1/..., Authorization token after TCP 16606 login, UDP 16601 discovery. Hardware access remains untested.
- Recommendation: VNNOX first, optional on-site box later for real-time evidence. VNNOX has next-day play logs and a 1,500 calls/hour limit. Probe: .claude/notes/billboard/probe-billboard.mjs. Masters: .claude/artifacts/billboard-audit.html and billboard-setup-checklist.html.
- Office in Nairobi, screen in Eldoret, manager in the US. Setup needs a 20-minute call with someone at the screen using ViPlex Handy. Confirm the helper and internet availability; otherwise a 4G module/data SIM is needed.

## Open items

- Confirm the real M-Pesa Paybill. MPESA_PAYBILL in src/lib/contact.ts is empty, so customers are directed to WhatsApp.
- Verify real staff sign-in on the live domain, stored advert playback and booking-email delivery. Migration readiness is verified.
- The older CampaignTheater effect lint error remains outside this release. Rulebook section 12 sign-off and decision 7, play-log export, remain open.

## Sources

.claude/handoffs/20261027-2300-bookings-store.md, 20261103-timetable-redesign.md, 20261103-nightshift-build-result.md, 20261106-pipeline-build-result.md and 20261107-production-release.md. Setup: .claude/notes/supabase-setup-checklist.md. Browser evidence: .claude/notes/pipeline-browser-check.mjs and .claude/notes/pipeline-qa/checks.json.
