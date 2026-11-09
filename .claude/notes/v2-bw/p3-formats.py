# Phase 3 one-off: swap ad hoc date, duration and plural formatting for src/lib/format.ts.
# Run from mail-os/apps/web.
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

edit('src/lib/signal-mail.ts', [('''export function durationLabel(seconds: number | null) {
  if (seconds === null) return "No replies yet";
  const minutes = Math.max(1, Math.round(seconds / 60));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours >= 24) return `${Math.floor(hours / 24)}d ${hours % 24}h`;
  return `${hours}h ${minutes % 60}m`;
}''', '''export function durationLabel(seconds: number | null) {
  return seconds === null ? "No replies yet" : formatDuration(seconds);
}''')], 'import { formatDuration } from "@/lib/format";')

edit('src/lib/signal-clients.ts', [('''export function displayDate(value: string | null): string {
  if (!value) return "No contact yet";
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Nairobi", day: "numeric", month: "short", year: "numeric" }).format(new Date(value));
}

export function replyDuration(seconds: number | null): string {
  if (seconds === null) return "No replies yet";
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  return `${(seconds / 3600).toFixed(1)}h`;
}''', '''export function displayDate(value: string | null): string {
  return formatDate(value, "No contact yet");
}

export function replyDuration(seconds: number | null): string {
  return seconds === null ? "No replies yet" : formatDuration(seconds);
}''')], 'import { formatDate, formatDuration } from "@/lib/format";')

edit('src/components/settings/settings.tsx', [('''  return value ? new Date(value).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }) : "Not yet";''', '''  return formatDateTime(value, "Not yet");''')], 'import { formatDateTime } from "@/lib/format";')

edit('src/app/drafts/page.tsx', [("""{new Date(draft.updatedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}""", """{formatDateTime(draft.updatedAt)}""")], 'import { formatDateTime } from "@/lib/format";')

edit('src/app/mail/page.tsx', [
    ("""<time>{thread.lastDate ? new Date(thread.lastDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : ''}</time>""", """<time dateTime={thread.lastDate ?? undefined}>{formatShortDate(thread.lastDate)}</time>"""),
    ("""          {thread.lastDate
            ? new Date(thread.lastDate).toLocaleDateString(undefined, {
                day: "numeric",
                month: "short",
                year: "numeric",
              })
            : ""}""", """          {formatDate(thread.lastDate)}"""),
    ("""value={latest?.date ? new Date(latest.date).toLocaleString() : null}""", """value={latest?.date ? formatDateTime(latest.date) : null}"""),
    ("""<time>{message.date ? new Date(message.date).toLocaleDateString('en-GB') : ''}</time>""", """<time dateTime={message.date ?? undefined}>{formatWhen(message.date)}</time>"""),
], "import { formatDate, formatDateTime, formatShortDate, formatWhen } from '@/lib/format';")

edit('src/app/settings/admin/audit/page.tsx', [
    ('''new Date(entry.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })''', '''formatDate(entry.createdAt)'''),
    ('''{new Date(entry.createdAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}''', '''{formatTime(entry.createdAt)}'''),
], 'import { formatDate, formatTime } from "@/lib/format";')

edit('src/app/settings/profile/page.tsx', [('''{user?.createdAt ? new Date(user.createdAt).toLocaleDateString("en-GB", { month: "long", year: "numeric" }) : "Not available"}''', '''{formatDate(user?.createdAt, "Not available")}''')], 'import { formatDate } from "@/lib/format";')

edit('src/components/collaboration.tsx', [('''{new Date(n.createdAt).toLocaleDateString()}''', '''{formatDateTime(n.createdAt)}''')], 'import { formatDateTime } from "@/lib/format";')

edit('src/components/compose.tsx', [('''function timeOf(d: Date): string {
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });''', '''function timeOf(d: Date): string {
  return formatTime(d);''')], 'import { formatTime } from "@/lib/format";')

edit('src/components/mail/conversation-context.tsx', [('''date: new Date(stateSince).toLocaleDateString("en-GB")''', '''date: formatDate(stateSince)''')], 'import { formatDate } from "@/lib/format";')

edit('src/components/mail/thread-list.tsx', [('''function formatRelative(iso: string): string {
  const d = new Date(iso);
  const diffH = (Date.now() - d.getTime()) / 36e5;
  if (diffH < 24) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (diffH < 24 * 7) return d.toLocaleDateString([], { weekday: "short" });
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}''', '''function formatRelative(iso: string): string {
  return formatWhen(iso);
}''')], "import { formatWhen } from '@/lib/format';")

edit('src/lib/compose-context.ts', [('''const when = m.date ? new Date(m.date).toLocaleString() : "";''', '''const when = m.date ? formatDateTime(m.date) : "";''')], 'import { formatDateTime } from "@/lib/format";')

edit('src/components/clients/client-projects.tsx', [
    ('''{displayDate(flight.startDate)} to {displayDate(flight.endDate)}''', '''{formatDateRange(flight.startDate, flight.endDate)}'''),
    ('''{displayDate(booked[0].startDate)} to {displayDate(booked.map(x => x.endDate).sort().at(-1)!)}''', '''{formatDateRange(booked[0].startDate, booked.map(x => x.endDate).sort().at(-1)!)}'''),
], 'import { formatDateRange } from "@/lib/format";')

edit('src/app/clients/detail/page.tsx', [
    ('''<small>{displayDate(stats.startDate)} to {displayDate(stats.endDate)}</small>''', '''<small>{formatDateRange(stats.startDate, stats.endDate)}</small>'''),
    ('''<small>{stats.firstReply.count} replies / last {stats.firstReply.days} days</small>''', '''<small>{plural(stats.firstReply.count, "reply", "replies")} in the last {stats.firstReply.days} days</small>'''),
    ('''<span className={s.muted}>{data.contacts.length} contacts</span>''', '''<span className={s.muted}>{plural(data.contacts.length, "contact")}</span>'''),
    ('''<small className={s.muted}>{contact.messageCount} messages</small>''', '''<small className={s.muted}>{plural(contact.messageCount, "message")}</small>'''),
], 'import { formatDateRange, plural } from "@/lib/format";')
print("ok")
