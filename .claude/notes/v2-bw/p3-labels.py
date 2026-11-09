# Phase 3 one-off: machine labels into plain words, and counts that pluralise.
# Run from mail-os/apps/web.
def edit(p, pairs, imp=None):
    s = open(p, encoding='utf-8').read()
    for a, b in pairs:
        assert a in s, (p, a[:70])
        s = s.replace(a, b)
    if imp and imp not in s:
        lines = s.split('\n')
        first = next(i for i, l in enumerate(lines) if l.startswith('import '))
        lines.insert(first, imp)
        s = '\n'.join(lines)
    open(p, 'w', encoding='utf-8').write(s)

edit('src/app/settings/mailboxes/page.tsx', [
    ('<Stat value={stats.data.conversationCount} label="conversations" />', '<Stat value={stats.data.conversationCount} label={stats.data.conversationCount === 1 ? "conversation" : "conversations"} />'),
    ('label="fetched / last 24h"', 'label="fetched in the last 24 hours"'),
    ('label="errors / last 24h"', 'label={stats.data.errorCount24Hours === 1 ? "error in the last 24 hours" : "errors in the last 24 hours"}'),
    ('<h3>Messages fetched / last 24 hours</h3>', '<h3>Messages fetched in the last 24 hours</h3>'),
])
edit('src/app/settings/admin/audit/page.tsx', [
    ('<h2>Activity / last 12 weeks</h2>', '<h2>Activity in the last 12 weeks</h2>'),
    ('UTC daily counts / all recorded events in this window', 'Events per day, counted in UTC'),
])
edit('src/app/settings/brand-kit/page.tsx', [
    ('<span>Phone / mail app</span>', '<span>As seen on a phone</span>'),
])
edit('src/components/clients/client-directory.tsx', [
    ('<span>{client.threadCount} conversations</span>', '<span>{plural(client.threadCount, "conversation")}</span>'),
    ('`${client.projectCount} projects`', 'plural(client.projectCount, "project")'),
], 'import { plural } from "@/lib/format";')
edit('src/components/shell/draft-count.tsx', [
    ('aria-label={`${drafts.length} drafts`}', 'aria-label={plural(drafts.length, "draft")}'),
], 'import { plural } from "@/lib/format";')
edit('src/app/drafts/page.tsx', [
    ('`${drafts.length} saved / ${drafts.filter((draft) => draftReadiness(draft).ready).length} ready`', '`${drafts.length} saved, ${drafts.filter((draft) => draftReadiness(draft).ready).length} ready to send`'),
])
edit('src/components/invitations.tsx', [
    ('<small>Invitation / {invitation.role}</small>', '<small>{invitation.role} invitation</small>'),
])
print('ok')
