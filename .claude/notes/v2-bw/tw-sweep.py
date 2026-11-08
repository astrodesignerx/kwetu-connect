# Phase 1 sweep: moves Tailwind classes in TSX onto the system scale. Run from mail-os/apps/web/src.
import os, re, sys

EXACT = [
    # small control variants instead of !important overrides
    ('reader-action shrink-0 !px-2 !py-1 !text-[11px]', 'reader-action reader-action-small shrink-0'),
    ('reader-action mt-1.5 !px-2 !py-1 !text-[11px]', 'reader-action reader-action-small mt-2'),
    ('reader-action !px-2 !py-1 !text-[11px]', 'reader-action reader-action-small'),
    ('reader-action !px-2.5 !py-2', 'reader-action'),
    ('reader-action !px-2', 'reader-action px-2'),
    ('btn-ghost !px-2 !py-0.5 !text-xs', 'reader-action reader-action-small'),
    ('btn-ghost !px-1 !py-0 !text-[11px]', 'tool-link'),
    ('btn-ghost !text-xs', 'tool-link'),
    ('btn-primary !inline-flex', 'signal-button btn-primary signal-button-small'),
    ('glass-input !py-1.5 !text-xs', 'glass-input glass-input-dense'),
    ('glass-input !py-1.5 !text-sm', 'glass-input glass-input-dense'),
    ('glass-input min-h-56 font-mono !text-xs', 'glass-input min-h-56 font-mono text-xs'),
    ('shrink-0 !px-2.5 !py-1.5 !text-xs', 'shrink-0'),
    ('!pr-3 font-mono !text-xs', 'pr-3 font-mono text-xs'),
    ('chip chip-client gap-1.5 !py-1', 'chip chip-client gap-2 py-1'),
    ('chip !py-1', 'chip py-1'),
    # rows that changed background on hover: one pick-row with an opacity hover
    ('w-full rounded-xl border border-line p-2 text-left text-sm transition hover:bg-raise', 'pick-row'),
    # destructive icon buttons stay neutral
    (' hover:!bg-red-500/10 hover:!text-red-500', ''),
    (' hover:text-red-500', ''),
    (' dark:hover:text-fg', ''),
    (' hover:text-fg', ''),
    ('className="fill-white dark:fill-surface"', 'fill="var(--surface)"'),
    ('rounded-[var(--radius)]', 'rounded-control'),
    ('"border-red-500/40 bg-red-500/5"', '"border-fg border-2 px-[11px] py-[7px]"'),
    ('transition-[transform,background-color,border-color]', 'transition-[transform,opacity]'),
    ('hover:-translate-y-px hover:bg-raise active:translate-y-0', 'hover:opacity-64 active:scale-[.98]'),
]
TOKENS = {
    'text-[10px]': 'text-xs', 'text-[11px]': 'text-xs', 'text-[12px]': 'text-xs', 'text-[13px]': 'text-secondary',
    'font-bold': 'font-semibold',
    'rounded-xl': 'rounded-control', 'rounded-lg': 'rounded-control', 'rounded-md': 'rounded-tag', 'rounded-[4px]': 'rounded-tag', 'rounded': 'rounded-tag',
    'gap-1.5': 'gap-2', 'gap-2.5': 'gap-3', 'px-2.5': 'px-3', 'px-1.5': 'px-2', 'py-1.5': 'py-2',
    'mt-2.5': 'mt-3', 'pt-2.5': 'pt-3', 'mt-1.5': 'mt-2', 'mb-1.5': 'mb-2', 'pt-1.5': 'pt-2', 'space-y-1.5': 'space-y-2',
    'h-1.5': 'h-2', 'w-1.5': 'w-2',
    'duration-150': 'duration-120', 'ease-out': 'ease-standard',
    'hover:bg-raise': 'hover:opacity-64',
    'bg-white': 'bg-paper', 'text-bad': 'text-fg',
}
DELIM = r'(?<=[\s"\'`{(])'
END = r'(?=[\s"\'`})])'

def sweep(text):
    for a, b in EXACT:
        text = text.replace(a, b)
    for a, b in TOKENS.items():
        text = re.sub(DELIM + re.escape(a) + END, b, text)
    # any remaining !utility inside a class list
    text = re.sub(r'(?<=[\s"\'`])!(?=(?:p[xytrbl]?|m[xytrbl]?|text|bg|inline|flex|gap)-)', '', text)
    return text

changed = []
for root, _, files in os.walk('.'):
    if root.replace('\\', '/').startswith('./app/dev'):
        continue
    for name in files:
        if not name.endswith('.tsx') or '.test.' in name:
            continue
        path = os.path.join(root, name)
        src = open(path, encoding='utf-8').read()
        out = sweep(src)
        if out != src:
            open(path, 'w', encoding='utf-8', newline='\n').write(out)
            changed.append(path)
print('\n'.join(changed))
