# Phase 3 one-off: brief dates and plain-word labels. Run from mail-os/apps/web.
import re
def edit(p, pairs, imp=None):
    s = open(p, encoding='utf-8').read()
    for a, b in pairs:
        assert a in s, (p, a[:70])
        s = s.replace(a, b)
    if imp and imp not in s:
        lines = s.split('\n')
        idx = max(i for i, l in enumerate(lines) if l.startswith('import '))
        lines.insert(idx + 1, imp)
        s = '\n'.join(lines)
    open(p, 'w', encoding='utf-8').write(s)

edit('src/components/mail/morning-brief.tsx', [
    ('''<p className={s.sectionLabel}>{new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}</p>
      <h1>Your morning brief</h1>''', '''<h1>Morning brief</h1>
      <p className={s.sectionLabel}><time dateTime={new Date().toISOString()}>{formatWeekday(new Date())} {formatDate(new Date())}</time></p>'''),
    ('''<p className={s.muted}>{data.firstReply.count} replies / {data.firstReply.workingDays} working days / organisation</p>''', '''<p className={s.muted}>Median across the team, from {plural(data.firstReply.count, "reply", "replies")} in the last {plural(data.firstReply.workingDays, "working day")}</p>'''),
    ('''<small>{flight.client} / {new Date(`${flight.startDate}T12:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</small>''', '''<small>{flight.client} / <time dateTime={flight.startDate}>{formatShortDate(flight.startDate)}</time></small>'''),
    ('''<p className={s.muted}>You are all caught up.</p>''', '''<p className={s.muted}>Nothing waiting on you</p>'''),
    ('''<p className={s.muted}>No upcoming flights.</p>''', '''<p className={s.muted}>No upcoming flights</p>'''),
], 'import { formatDate, formatShortDate, formatWeekday, plural } from "@/lib/format";')

p = 'src/components/clients/client-projects.tsx'
s = open(p, encoding='utf-8').read()
if 'displayDate(' not in s:
    s = s.replace('import { displayDate, nairobiToday } from "@/lib/signal-clients";', 'import { nairobiToday } from "@/lib/signal-clients";')
open(p, 'w', encoding='utf-8').write(s)
print('ok')
