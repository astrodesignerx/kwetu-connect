# Phase 3 one-off: dates in meta rows sit in <time>, which is the one mono style.
# Run from mail-os/apps/web.
def edit(p, pairs):
    s = open(p, encoding='utf-8').read()
    for a, b in pairs:
        assert a in s, (p, a[:70])
        s = s.replace(a, b)
    open(p, 'w', encoding='utf-8').write(s)

edit('src/app/clients/detail/page.tsx', [
    ('<small>{formatDateRange(stats.startDate, stats.endDate)}</small>', '<small><time dateTime={stats.startDate}>{formatDateRange(stats.startDate, stats.endDate)}</time></small>'),
])
edit('src/app/mail/page.tsx', [
    ('''        <span className="shrink-0 text-xs tabular-nums text-muted">
          {formatDate(thread.lastDate)}
        </span>''', '''        <time className="shrink-0 text-muted" dateTime={thread.lastDate ?? undefined}>
          {formatDate(thread.lastDate)}
        </time>'''),
])
edit('src/app/settings/admin/users/page.tsx', [
    ('Last sign-in {dateTime(person.lastLoginAt)}', 'Last sign-in <time dateTime={person.lastLoginAt ?? undefined}>{dateTime(person.lastLoginAt)}</time>'),
])
edit('src/app/settings/mailboxes/page.tsx', [
    ('<p>Last verified {dateTime(mailbox.lastVerifiedAt)}</p>', '<p>Last verified <time dateTime={mailbox.lastVerifiedAt ?? undefined}>{dateTime(mailbox.lastVerifiedAt)}</time></p>'),
    ('<p>Last sync {dateTime(stats.data?.lastSyncCompletedAt)}</p>', '<p>Last sync <time dateTime={stats.data?.lastSyncCompletedAt ?? undefined}>{dateTime(stats.data?.lastSyncCompletedAt)}</time></p>'),
])
edit('src/app/settings/profile/page.tsx', [
    ('<dd>{formatDate(user?.createdAt, "Not available")}</dd>', '<dd><time dateTime={user?.createdAt ?? undefined}>{formatDate(user?.createdAt, "Not available")}</time></dd>'),
])
edit('src/app/settings/templates/page.tsx', [
    ('<span className={s.date}>Edited {displayDate(latest.updatedAt)}</span>', '<span className={s.date}>Edited <time dateTime={latest.updatedAt}>{displayDate(latest.updatedAt)}</time></span>'),
    ('<span className={s.date}>{displayDate(t.updatedAt)}</span>', '<time className={s.date} dateTime={t.updatedAt}>{displayDate(t.updatedAt)}</time>'),
])
edit('src/components/clients/client-projects.tsx', [
    ('{projects.find(p => p.id === flight.projectId)?.name} / {formatDateRange(flight.startDate, flight.endDate)}</small>', '{projects.find(p => p.id === flight.projectId)?.name} / <time dateTime={flight.startDate}>{formatDateRange(flight.startDate, flight.endDate)}</time></small>'),
    ('<small>{formatDateRange(booked[0].startDate, booked.map(x => x.endDate).sort().at(-1)!)}</small>', '<small><time dateTime={booked[0].startDate}>{formatDateRange(booked[0].startDate, booked.map(x => x.endDate).sort().at(-1)!)}</time></small>'),
])
print('ok')
