# Phase 3 one-off: plain titles, no slogans, and no trailing period on one-sentence
# labels, hints and messages. Multi-sentence messages keep their periods.
# Run from mail-os/apps/web.
import re, pathlib

SPECIFIC = {
    'src/app/login/page.tsx': [('title="Welcome back."', 'title="Sign in"'), ('subtitle="Sign in to Kwetu OS"', 'subtitle="Use your Kwetu OS account"')],
    'src/app/settings/page.tsx': [('<SettingsHeader title="Settings" context="" description="Your workspace, in good order." />', '<SettingsHeader title="Settings" context="" />')],
    'src/app/drafts/page.tsx': [('No drafts. Your next message starts here.', 'No drafts')],
    'src/app/settings/templates/page.tsx': [('<h2>Your next message starts here.</h2>', '<h2>No templates yet</h2>')],
    'src/app/settings/admin/audit/page.tsx': [('description="A readable record of administrative actions."', 'description="Every administrative action, newest first"'), ('Most recent 200 events. Timeline dates use your local time.', 'The latest 200 events, in Nairobi time')],
    'src/app/settings/brand-kit/page.tsx': [('description="A consistent identity on every message you send."', 'description="How every message you send looks"')],
    'src/components/ai-panel.tsx': [('"Could not summarize."', '"Could not summarise"')],
    'src/components/compose.tsx': [('No templates yet. Create one in Settings → Templates.', 'No templates yet. Create one in Settings, under Templates.')],
}
# Strings that are content, not interface copy.
KEEP = {'Write the rest here.'}
PATTERN = re.compile(r'(>|")([A-Z][^<>"{}]{3,90}?)\.(<|")')

def strip(match):
    body = match.group(2)
    if body + '.' in KEEP or '. ' in body or '?' in body or body.endswith('.'):
        return match.group(0)
    return match.group(1) + body + match.group(3)

changed = []
for path in pathlib.Path('src').rglob('*.tsx'):
    p = path.as_posix()
    if p.startswith('src/app/dev') or '.test.' in p:
        continue
    s = open(p, encoding='utf-8').read()
    before = s
    for a, b in SPECIFIC.get(p, []):
        assert a in s, (p, a)
        s = s.replace(a, b)
    out = []
    for line in s.split('\n'):
        if line.lstrip().startswith(('import ', '//', '*', '/*')) or 'className=' in line and PATTERN.search(line) is None:
            out.append(line)
            continue
        out.append(PATTERN.sub(strip, line))
    s = '\n'.join(out)
    if s != before:
        open(p, 'w', encoding='utf-8').write(s)
        changed.append(p)
print('\n'.join(changed))
