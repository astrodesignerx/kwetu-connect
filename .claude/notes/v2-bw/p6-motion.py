# Phase 6 one-off: entrance once per app load, no per-panel mount animations,
# no dead stagger styles. Busy spinners and user-triggered open/close stay.
# Run from mail-os/apps/web.
import re

def edit(p, pairs):
    s = open(p, encoding='utf-8').read()
    for a, b in pairs:
        assert a in s, (p, a[:80])
        s = s.replace(a, b)
    open(p, 'w', encoding='utf-8').write(s)

# Charts and flight bars draw in place; they no longer grow on every visit.
p = 'src/components/signal/signal.module.css'
css = open(p, encoding='utf-8').read()
css = css.replace(' transform-origin: bottom; animation: growY var(--t3) var(--ease) both; animation-delay: calc(var(--i, 0) * 16ms);', '')
css = css.replace(' transform-origin: left; animation: growX var(--t3) var(--ease) both; animation-delay: calc(var(--i, 0) * 48ms);', '')
css = css.replace(' animation: flightIn var(--t3) var(--ease) both; animation-delay: calc(var(--i, 0) * 48ms);', '')
for kf in ['growY', 'flightIn', 'growX']:
    css = re.sub(r'@keyframes ' + kf + r' \{[^\n]*\n', '', css)
assert 'growX' not in css and 'growY' not in css and 'flightIn' not in css, 'leftover chart animation'
open(p, 'w', encoding='utf-8').write(css)

p = 'src/components/empty-state.module.css'
css = open(p, encoding='utf-8').read()
css = css.replace(' animation: empty-in var(--t2) var(--ease) both;', '')
css = re.sub(r'@keyframes empty-in[^\n]*\n', '', css)
open(p, 'w', encoding='utf-8').write(css)

# Inline stagger styles with nothing left to stagger.
edit('src/app/drafts/page.tsx', [(" style={{ animationDelay: Math.min(index, 6) * 50 + 'ms' }}", '')])
edit('src/components/mail/thread-list.tsx', [(" style={{ animationDelay: Math.min(index, 6) * 50 + 'ms' }}", '')])
edit('src/components/clients/client-directory.tsx', [(' style={{ "--i": Math.min(index, 8) } as CSSProperties}', '')])
edit('src/components/shell/sidebar.tsx', [('\n            style={{ "--i": index } as React.CSSProperties} className=', '\n            className=')])
edit('src/components/signal/campaign.tsx', [(', "--i": index } as SignalStyle} title={text}>', ' } as SignalStyle} title={text}>')])

# The main content arrives once, on the first load of the app, not on every navigation.
edit('src/components/app-shell.tsx', [
    ('<main id="main-content" className="signal-canvas">', '<main id="main-content" className="signal-canvas" data-enter={enter}>'),
])
s = open('src/components/app-shell.tsx', encoding='utf-8').read()
anchor = 'export function ShellContent('
assert anchor in s
s = s.replace(anchor, '''// True until the shell has shown its content once in this tab. Section layouts
// remount the shell on navigation, so the flag lives outside the component.
let shellEntered = false;

''' + anchor, 1)
body_start = s.index('{', s.index(anchor))
# insert after the first line of the component body
first_line_end = s.index('\n', s.index(') {', s.index(anchor))) + 1
s = s[:first_line_end] + '''  const [enter] = useState(() => !shellEntered);
  useEffect(() => { shellEntered = true; }, []);
''' + s[first_line_end:]
open('src/components/app-shell.tsx', 'w', encoding='utf-8').write(s)

edit('src/app/globals.css', [
    ('  .signal-canvas { display: flex;', '  .signal-canvas[data-enter=true] { animation: content-in var(--t3) var(--ease) both; }\n  @keyframes content-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }\n  .signal-canvas { display: flex;'),
])
print('ok')
