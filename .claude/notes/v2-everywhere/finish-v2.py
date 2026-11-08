from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[3]
SRC = ROOT / 'mail-os/apps/web/src'

def edit(name, transform):
    path = SRC / name
    before = path.read_text(encoding='utf-8')
    after = transform(before)
    if after != before:
        path.write_text(after, encoding='utf-8', newline='\n')

# Entrance animations release transform after arrival so hover and press still work.
for path in SRC.rglob('*.css'):
    if '/app/dev/' in path.as_posix():
        continue
    edit(path.relative_to(SRC), lambda text: re.sub(
        r'(animation:\s*(?:signal-arrive|rail-arrive|arrive)\b[^;{}]*?)\bboth\b',
        r'\1backwards', text))

for name in [
    'app/settings/templates/new/page.module.css',
    'app/settings/templates/page.module.css',
    'app/settings/page.module.css',
    'app/settings/brand-kit/page.module.css',
    'app/settings/mailboxes/page.module.css',
    'app/settings/admin/users/page.module.css',
    'components/clients/forms.module.css',
    'components/clients/client-directory.module.css',
    'app/settings/templates/edit/page.module.css',
]:
    edit(name, lambda text: re.sub(r'font: 10px var\(--f-mono\)', 'font: 500 12px/1.5 var(--f-body)', text))

edit('app/clients/detail/page.module.css', lambda text: text.replace('.monogram { display: none; }\n', ''))
edit('components/settings/settings.module.css', lambda text: text.replace('var(--f-display)', 'var(--f-body)'))
edit('components/settings/invitations.module.css', lambda text: text.replace('var(--f-display)', 'var(--f-body)'))

# Maintain the prescribed focus ring even on controls with local styles.
for path in SRC.rglob('*.css'):
    if '/app/dev/' in path.as_posix():
        continue
    edit(path.relative_to(SRC), lambda text: re.sub(
        r'outline: 2px solid var\(--(?:sodium|jac)\); outline-offset: \dpx;',
        'outline: 2px solid var(--fg); outline-offset: 3px;', text))

print('Finished entrance, typography and focus refinements.')

edit('app/globals.css', lambda text: re.sub(
    r'box-shadow: [^;{}]*rgb\(251 176 64 / [^;{}]*;',
    'box-shadow: var(--mail-shadow);', text)
    .replace('rgb(251 176 64 / 0.1)', 'var(--raise)')
    .replace('rgb(251 176 64 / 0.07)', 'var(--raise)')
    .replace('rgb(251 176 64 / 0.45)', 'var(--line)')
    .replace('rgb(251 176 64 / 0.75)', 'var(--fg)')
    .replace('@apply border-green-600/35 bg-green-600/15 text-green-700 dark:border-green-400/30 dark:text-green-300;', '@apply border-line bg-raise text-muted;'))
