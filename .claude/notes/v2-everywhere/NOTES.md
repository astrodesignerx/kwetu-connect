# V2 everywhere

Goal: apply the existing minimal /mail design to all Kwetu OS pages. Work stays on t3/mail-os-v2-everywhere, based on 76c533e. No push, merge into the main branch or deployment is authorised.

## Current status

Implementation, screenshot review and every acceptance check are complete. The full required matrix covers 384 route, viewport, theme and state combinations. Focused reruns, the development fixture and overlays bring the retained total to 545 PNGs, all represented in 18 review sheets. TypeScript, ESLint, 123 tests and the single production build pass. The named-path commit is the delivery commit on t3/mail-os-v2-everywhere. The root lockfile stays outside that commit.

The task-owned server is stopped. Generated .next files and the two browser profiles left by interrupted checks are removed. Free disk space stayed above 1 GB throughout; the last observed value after cleanup was about 3 GB. Nothing was pushed, merged into the main branch or deployed.

## Decisions and corrections

- The root pnpm-lock.yaml changed in the interrupted run when `pnpm --dir .claude/notes/v2-everywhere/tools add playwright-core` added a workspace importer and Playwright 1.65.0. It is deliberately excluded from commits. The tool now has a separate lockfile. Reinstall it with `pnpm.cmd install --ignore-workspace --frozen-lockfile` in its tools directory.
- Next inferred the public site as a Turbopack root and tried to compile the public site's Supabase proxy. `next.config.ts` now explicitly uses the independent mail-os workspace root. No proxy destination, API call or authentication flow changed.
- The shared browser reported available=false. Isolated headless Chrome provides the repeatable browser checks. HTTP and hub traffic is fulfilled inside the browser. The local server uses API_URL=http://127.0.0.1:59999, NEXT_PUBLIC_API_URL=http://127.0.0.1:3024 and NEXT_PUBLIC_HUB_URL=http://127.0.0.1:3024. No traffic can fall through to the real API.
- Signed-in fixtures are synthetic Admin users with example.test addresses. Login and registration fixtures are anonymous. The development mail fixture uses its own local fetch replacement without a token, so it never tries a live hub.
- Entrance animations release transform after arrival, so hover and press work. The insert-field picker uses the existing Popover primitive for an animated exit. Its exit has a distinct animation name so animationend runs after a completed entrance. Reduced motion ends immediately while preserving the dismissal event.
- The phone client header gives long names the full card width. The Settings activity strip has a fixed height so sparse data cannot create giant squares. Brand kit and template editor layouts use the same neutral cards and spacing as /mail.
- The audit heatmap is capped at 520px so it supports the event timeline instead of dominating the page.
- MorningBrief no longer imports BoardMini or LedBar. Its counts use a semantic definition list and its flight links use a simple calendar mark. The displayed values, dates, destinations and API remain the same. Two visual assertions in components/mail/mail-screens.test.tsx were updated: the populated LED image label now checks the displayed counts, and the error check looks for the new lowercase unread label. All other assertions and test counts stay intact.
- Email previews and colour pickers retain the colours of the email content. This is editable user content. The surrounding UI stays neutral. Existing logo artwork remains unchanged.
- Forms with no remote initial data have the same empty and initial loading appearance. The browser script additionally submits the profile, connection and new-template forms to capture error and busy/disabled states. No fixture can send a real message or connect a mailbox.
- Developer badges are hidden only while taking screenshots. Both themes, three viewport widths and every required state are saved as PNGs. Long content also has bottom captures. Contact sheets in review include every saved capture.
- Raw PowerShell logs classify pnpm's stderr progress and Vite's existing config-format advisory as NativeCommandError records. The native process exit codes are explicitly recorded as zero. The portable build.txt and vitest.txt retain the output with ASCII formatting. No required check was skipped.
- Automatic approval review rejected two forced cache-cleanup commands as blocked by policy. Cleanup succeeded using the verified literal paths with Remove-Item -Recurse and no Force. No cleanup remains blocked.

## Amber retained

No brand-amber utilities remain outside the development gallery. Semantic attention uses the waiting token instead:

- Mail waiting labels, pending reply state counts and morning-brief waiting items.
- Clients waiting on our reply, in both the directory and communication history.
- Draft readiness guidance when required details are missing.
- Workspace connections needing attention and mailbox connections waiting for sync.
- Pending invitations and incomplete password-strength guidance.
- The connecting live-update indicator.

Errors and destructive actions use red. Healthy, completed and neutral statuses use grey or black. LED components remain available to the development gallery.

## Reproduction

From mail-os/apps/web, set the three environment variables above and run `pnpm.cmd exec next dev -p 3024 --hostname 127.0.0.1`. From the repository root, run `node .claude/notes/v2-everywhere/browser-check.mjs`. CHROME_PATH can override the local Chrome executable. CHECK_ROUTES, CHECK_SCENARIOS, CHECK_WIDTHS, CHECK_THEMES and CHECK_REPORT select a focused rerun. Run `python .claude/notes/v2-everywhere/contact-sheets.py` to rebuild the visual review sheets.

Before the production build, stop port 3024 and remove this worktree's .next directory. Run the four acceptance commands in apps/web, then `python .claude/notes/v2-everywhere/audit.py` and `git diff --check` from the repository root. Keep the single production build log as evidence, then delete .next. Stop if C: has less than 1 GB free.

No OpenCode jobs were launched in this continuation. OpenCode cost: zero.

## Evidence

REPORT.md lists every changed web file and the final check results. acceptance-results.json records the acceptance commands and screenshot totals. browser-routes.json records the full required matrix. browser-refinements.json and browser-final-pages.json record the focused page reruns. browser-overlays.json records the reader, More drawer, palette, composer, insert-field popover, template picker, template fill form, toasts and reduced-motion dismissal. browser-extra.json records the development fixture and measured token contrast. source-audit.json records the final source grep and punctuation scan. commit-paths.json is the exact named-path allowlist used for staging.
