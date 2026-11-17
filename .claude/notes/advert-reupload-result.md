# Advert replacement implementation

Branch: ds/advert-reupload. Base: a1862c06f8e2a12f6cf577766f16af4ec3ac3fa5. Work stayed in C:/Users/ether/.t3/worktrees/kwetu-connect/t3-adead73e. No push, merge, deployment, migration or external email send. No OpenCode job ran; OpenCode cost: zero.

## Result and release blocker

The application now keeps payment first, shows the check/refund notice under the amount for both payment choices, exposes only the aggregate advert decision and refusal reason, permits customer replacement for Quote/Paid/Approved with refused or absent adverts, and sends a courtesy email after successful staff refusal. The booking, payment, dates and history remain unchanged by replacement. Approved and waiting adverts have no public upload form. The existing shared BaseStore implements these changes for memory, demo and Supabase without separate public-booking builders.

The database has a conflicting existing limit. supabase/migrations/0001_bookings.sql:69 defines limit_booking_adverts; lines 73 to 74 reject inserts when three other advert rows exist, regardless of decision. The before-insert-or-update trigger remains installed in the checked-in migrations through 0004. Supabase therefore still rejects the fourth total file, even if previous files were refused. The application correctly enforces three non-refused files and six total, including concurrent uploads, but the database trigger needs a separately authorised migration to support that behaviour in production. This task expressly excludes migrations, so none was changed or applied. Live Supabase was not inspected or modified.

The refund notice and terms need owner approval before release. Real email delivery, real stored-media upload/playback and browser interaction were not verified. Page checks render server output with peripheral components mocked. Action/store tests use memory data and mocked Next redirects/cache and email services. The build used memory mode without Supabase credentials. CSS reuses quote-in (opacity and translateY), the existing 200 ms duration token and standard easing; reduced motion disables the alert animation.

## Changed files

- src/components/booking/PayPanel.tsx: shared advert-check/refund notice under amount due.
- src/lib/store/types.ts: public advertState and optional refusedReason, without advert identifiers or metadata.
- src/lib/store/base.ts: aggregate state priority, newest refused-file reason and transaction-safe application upload caps.
- src/app/book/actions.ts: validated customer replacement action, safe file names, cache refresh and success/failure redirects.
- src/app/book/q/[reference]/page.tsx: refusal reason, replacement form, upload feedback, advert facts and updated Paid copy.
- src/app/globals.css: alert entrance and reduced-motion handling using existing motion tokens.
- src/lib/booking-mail.ts: refusal email subject, escaped reason and booking button.
- src/app/manage/actions.ts: email the stored advertiser after refusal, with courtesy failures isolated.
- src/app/terms/page.tsx: advert checks and refunds section, numbering and November update date.
- src/lib/store/memory.test.ts: state priority/privacy, refused-file exclusion, six-file cap, concurrency and unchanged booking tests.
- src/app/book/actions.test.ts: customer permissions, waiting replacements, safe file names and failure preservation tests.
- src/app/book/q/[reference]/page.test.tsx: rendered notice placement, refusal reason/form, default length and approved/waiting form exclusion tests.
- src/app/manage/actions.test.ts: saved-before-email ordering, optional email, failed decisions and email-failure isolation tests.
- src/lib/booking-mail.test.ts: escaped reason, booking link, optional email and delivery failure tests.
- src/components/CampaignTheater.tsx: corrected pre-existing full-lint failure with useSyncExternalStore for reduced-motion preference; no design change.
- STATE.md: local result, release blocker and verification boundary.
- .claude/notes/advert-reupload-result.md: this implementation report and git command ledger.

## Validation

Dependencies: pnpm.cmd install --frozen-lockfile succeeded without lockfile changes.

Final checks:

```text
pnpm.cmd test
Test Files  19 passed (19)
Tests       181 passed (181)
Exit 0

pnpm.cmd exec tsc --noEmit
No diagnostics. Exit 0.

pnpm.cmd lint
$ eslint
No diagnostics. Exit 0.

pnpm.cmd build
Next.js 16.2.6 (Turbopack)
Compiled successfully in 11.5s
Finished TypeScript in 34.9s
Generating static pages (19/19)
Exit 0
```

package.json has no typecheck script, so TypeScript was invoked directly. The first full lint run failed on the existing CampaignTheater synchronous effect state update; the small subscription fix above resolved it. Interim TypeScript found missing fields in new test fixtures; those fixtures were corrected before the final successful checks. Vitest emitted its existing ESM/CommonJS config-loader warning. Next emitted a multiple-workspace-lockfiles/root warning. Neither prevented success. No browser QA or live acceptance is claimed.

The first staging command reported that .claude is ignored, while staging the requested tracked/new source paths. The report was then force-added by exact path only. The staged whitespace check caught a trailing blank line in the new manager action test; it was removed before commit.

## Git command ledger

Every git invocation in this task, in execution order, including repeated checks:

```powershell
git status --short
git branch --show-current
git switch -c ds/advert-reupload
git diff --stat
git diff --check
git diff -- src/lib/store/base.ts src/app/book/actions.ts src/app/manage/actions.ts src/lib/booking-mail.ts
git diff --check
git diff --stat
git log -3 --oneline
git rev-parse HEAD
git status --short
git diff -- src/components/CampaignTheater.tsx src/app/terms/page.tsx src/app/globals.css src/app/book/q src/components/booking/PayPanel.tsx src/lib/store/types.ts
git diff --check
git add -- STATE.md .claude/notes/advert-reupload-result.md src/app/book/actions.ts src/app/book/actions.test.ts 'src/app/book/q/[reference]/page.tsx' 'src/app/book/q/[reference]/page.test.tsx' src/app/globals.css src/app/manage/actions.ts src/app/manage/actions.test.ts src/app/terms/page.tsx src/components/CampaignTheater.tsx src/components/booking/PayPanel.tsx src/lib/booking-mail.ts src/lib/booking-mail.test.ts src/lib/store/base.ts src/lib/store/memory.test.ts src/lib/store/types.ts
git diff --cached --check
git diff --cached --stat
git add -- src/app/manage/actions.test.ts
git add -f -- .claude/notes/advert-reupload-result.md
git diff --cached --check
git diff --cached --stat
git commit -m "feat: support advert replacements after refusal, no attribution needed"
git rev-parse HEAD
git status --short
git log -1 --oneline
```
