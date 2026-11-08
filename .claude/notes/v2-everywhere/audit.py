from pathlib import Path
import json
import re
import subprocess

ROOT = Path(__file__).resolve().parents[3]
SRC = ROOT / 'mail-os/apps/web/src'
notes = Path(__file__).resolve().parent
changed = subprocess.check_output(['git', 'diff', '--name-only', '--', 'mail-os/apps/web'], cwd=ROOT, text=True).splitlines()
issues = []
for name in changed:
    path = ROOT / name
    if not path.is_file() or path.name == 'AGENTS.md':
        continue
    content = path.read_text(encoding='utf-8')
    for line, value in enumerate(content.splitlines(), 1):
        if re.search(r'[\u2013\u2014\u00b7\u2022]', value):
            issues.append({'path': name, 'line': line, 'reason': 'Forbidden punctuation'})

matches = []
for path in SRC.rglob('*'):
    if not path.is_file() or '/app/dev/' in path.as_posix() or '.test.' in path.name:
        continue
    if path.suffix not in ['.ts', '.tsx', '.css']:
        continue
    for line, value in enumerate(path.read_text(encoding='utf-8').splitlines(), 1):
        reason = None
        if 'eyebrow' in value:
            reason = 'Old section-label naming'
        if '/app/' in path.as_posix() and re.search(r'\b(?:StateBoard|clientColour\()', value):
            reason = 'Old app page state or client hue'
        if 'brand-amber' in value:
            reason = 'Amber utility needs review'
        if reason:
            matches.append({'path': path.relative_to(ROOT).as_posix(), 'line': line, 'reason': reason})

result = {'changedWebFiles': len(changed), 'punctuationIssues': issues, 'sourceGrepMatches': matches}
(notes / 'source-audit.json').write_text(json.dumps(result, indent=2) + '\n', encoding='utf-8')
print(json.dumps(result, indent=2))
assert not issues and not matches, 'Source acceptance failed'
