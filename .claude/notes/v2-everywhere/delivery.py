from pathlib import Path
import json
import re
import subprocess
import unicodedata

ROOT = Path(__file__).resolve().parents[3]
NOTES = Path(__file__).resolve().parent

def read_log(name):
    data = (NOTES / name).read_bytes()
    return data.decode('utf-16' if data.startswith(b'\xff\xfe') else 'utf-8-sig')

reports = ['browser-routes.json', 'browser-refinements.json', 'browser-final-pages.json', 'browser-overlays.json', 'browser-extra.json']
for name in reports:
    report = json.loads((NOTES / name).read_text(encoding='utf-8'))
    for key in ['failures', 'unknown', 'forbiddenRequests', 'consoleErrors']:
        assert not report[key], (name, key)

for route in ['clients', 'client-detail', 'drafts', 'settings', 'profile', 'mailboxes', 'connect', 'brand-kit', 'templates', 'template-new', 'template-edit', 'admin-users', 'admin-audit', 'login', 'register', 'mail']:
    for width in [1440, 1280, 390]:
        for theme in ['light', 'dark']:
            for scenario in ['populated', 'empty', 'error', 'loading']:
                assert (NOTES / 'screenshots' / f'{route}-{width}-{theme}-{scenario}.png').is_file()

build = read_log('build.log')
tests = read_log('vitest-final.log')
assert 'Exit code: 0' in build and 'Compiled successfully' in build
assert 'Exit code: 0' in tests and '123 passed' in tests
assert not read_log('typecheck.log').strip()
assert not read_log('eslint.log').strip()
for source, target in [('build.log', 'build.txt'), ('vitest-final.log', 'vitest.txt')]:
    text = re.sub(r'\x1b\[[0-9;]*m', '', read_log(source))
    text = unicodedata.normalize('NFKD', text).encode('ascii', 'ignore').decode('ascii')
    text = '\n'.join(line.rstrip() for line in text.splitlines()) + '\n'
    (NOTES / target).write_text(text, encoding='utf-8', newline='\n')

shots = sorted((NOTES / 'screenshots').glob('*.png'))
result = {
    'commands': {
        'pnpm.cmd exec tsc --noEmit': 'pass, exit 0',
        'pnpm.cmd build': 'pass, exit 0, one production build',
        'pnpm.cmd exec eslint src': 'pass, exit 0',
        'pnpm.cmd exec vitest run': 'pass, exit 0, 123 tests in 20 files',
        'source grep and punctuation audit': 'pass, no matches',
        'git diff --check': 'pass',
    },
    'requiredBrowserCombinations': 384,
    'retainedPngs': len(shots),
    'reviewSheets': len(list((NOTES / 'review').glob('*.jpg'))),
    'browserReports': reports,
    'productionBuildCount': 1,
    'serverStopped': True,
    'nextCacheRemoved': not (ROOT / 'mail-os/apps/web/.next').exists(),
    'rootLockfileExcluded': True,
}
assert result['nextCacheRemoved']
(NOTES / 'acceptance-results.json').write_text(json.dumps(result, indent=2) + '\n', encoding='utf-8')

changed = subprocess.check_output(['git', 'diff', 'HEAD', '--name-only', '--', 'mail-os/apps/web'], cwd=ROOT, text=True).splitlines()
assert 'mail-os/apps/web/AGENTS.md' not in changed

def describe(name):
    if name.endswith('next.config.ts'):
        return 'Keep Turbopack inside the mail workspace.'
    if name.endswith('globals.css'):
        return 'Share V2 tokens, fields, pills, overlays and reduced-motion rules.'
    if name.endswith('light-field.tsx'):
        return 'Remove the unused LED sign-in scene.'
    if name.endswith('mail-screens.test.tsx'):
        return 'Update two visual assertions for the plain morning-brief counters.'
    if name.endswith('.css'):
        return 'Apply neutral V2 surfaces, spacing, responsive layout and control states.'
    if '/app/' in name:
        return 'Use neutral tokens and quiet page states while preserving data and controls.'
    if name.endswith('app-shell.tsx') or name.endswith('sidebar.tsx') or name.endswith('topbar.tsx'):
        return 'Use the shared V2 shell and the correct current destination.'
    if name.endswith('popover.tsx') or name.endswith('merge-field-menu.tsx'):
        return 'Animate the insert-field picker through opening and dismissal.'
    if name.endswith('morning-brief.tsx'):
        return 'Replace LED components with plain counts and neutral flight marks.'
    return 'Use shared neutral tokens and preserve existing interactions.'

lines = ['DONE: yes', '', 'CHANGED:', '']
lines += [f'- {name}: {describe(name)}' for name in changed]
lines += [
    '- .claude/notes/v2-everywhere/browser-check.mjs: Repeatable browser fixtures and route, overlay, contrast and network assertions.',
    '- .claude/notes/v2-everywhere/screenshots/: Verified PNGs for every required combination and additional states.',
    '- .claude/notes/v2-everywhere/review/: Contact sheets covering every screenshot.',
    '- .claude/notes/v2-everywhere/: Notes, source audit, acceptance evidence and isolated browser-tool lockfile.',
    '', 'CHECKS:', '',
]
lines += [f'- {command}: {outcome}.' for command, outcome in result['commands'].items()]
lines += [
    f'- Browser checks: pass. {len(shots)} retained PNGs, including all 384 required combinations. No uncaught errors, unexpected console errors, horizontal page overflow or protected-port requests.',
    '- Both themes: pass. Text token contrast is at least 4.95:1.',
    '', 'BLOCKED: none remaining. Automatic review rejected forced cache cleanup as blocked by policy. The verified literal paths were cleaned successfully without Force.',
    '', 'NOTES: Root pnpm-lock.yaml remains uncommitted after the interrupted Playwright installation. No real API, database or mailbox was contacted. The server, generated cache and task-owned temporary browser profiles are cleaned up. Two visual assertions changed as documented in NOTES.md. Semantic waiting and attention colours are listed there. No push, merge into the main branch or deployment occurred. OpenCode cost: zero.',
    '', 'Branch: t3/mail-os-v2-everywhere',
    'Screenshots: ' + (NOTES / 'screenshots').as_posix(),
]
(NOTES / 'REPORT.md').write_text('\n'.join(lines) + '\n', encoding='utf-8')

note_files = ['NOTES.md', 'REPORT.md', 'browser-check.mjs', 'audit.py', 'contact-sheets.py', 'delivery.py', 'finish-v2.py', 'source-audit.json', 'acceptance-results.json', 'build.txt', 'vitest.txt', 'tools/package.json', 'tools/pnpm-lock.yaml', *reports]
paths = changed + [(NOTES / name).relative_to(ROOT).as_posix() for name in note_files]
paths += [p.relative_to(ROOT).as_posix() for p in shots]
paths += [p.relative_to(ROOT).as_posix() for p in sorted((NOTES / 'review').glob('*.jpg'))]
paths.append((NOTES / 'commit-paths.json').relative_to(ROOT).as_posix())
assert all(p.startswith(('mail-os/apps/web/', '.claude/notes/v2-everywhere/')) for p in paths)
(NOTES / 'commit-paths.json').write_text(json.dumps(paths, indent=2) + '\n', encoding='utf-8')
for name in paths:
    p = ROOT / name
    if p.is_file() and p.suffix not in ['.png', '.jpg']:
        assert not re.search(r'[\u2013\u2014\u00b7\u2022]', p.read_text(encoding='utf-8-sig')), name
print(json.dumps(result, indent=2))
print(f'Named commit paths: {len(paths)}')
