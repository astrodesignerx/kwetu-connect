# Phase 4 one-off: every page-level empty state uses components/empty-state.tsx.
# Run from mail-os/apps/web.
def edit(p, pairs, imps=()):
    s = open(p, encoding='utf-8').read()
    for a, b in pairs:
        assert a in s, (p, a[:70])
        s = s.replace(a, b)
    for imp in imps:
        if imp not in s:
            lines = s.split('\n')
            first = next(i for i, l in enumerate(lines) if l.startswith('import '))
            lines.insert(first, imp)
            s = '\n'.join(lines)
    open(p, 'w', encoding='utf-8').write(s)

# Mail: no mailbox, and the art goes.
p = 'src/app/mail/page.tsx'
s = open(p, encoding='utf-8').read()
start = s.index('function NoMailboxes() {')
end = s.index('\n}\n', start) + 3
s = s[:start] + '''function NoMailboxes() {
  return (
    <div className={s.noMailbox}>
      <EmptyState icon={Mail} title="No mailbox connected"
        text="Connect your cPanel mailbox and your mail syncs into this workspace"
        action={<Link href="/settings/mailboxes/connect" className={buttonClass("default")}>Connect a mailbox</Link>} />
    </div>
  );
}
''' + s[end:]
start = s.index('/**\n * Empty-state art:')
end = s.index('\n}\n', start) + 3
s = s[:start] + s[end:].lstrip('\n')
open(p, 'w', encoding='utf-8').write(s)
edit(p, [('import { Button } from "@/components/ui";', 'import { Button, buttonClass } from "@/components/ui";')], ['import { EmptyState } from "@/components/empty-state";'])

edit('src/components/mail/thread-list.tsx', [
    ("""  if (!items.length) return <div className={s.quiet}>{query ? 'No conversations match this search.' : 'Nothing here.'}</div>;""",
     """  if (!items.length) return query ? <EmptyState bare icon={Search} title="No matches" text="No conversations match this search" /> : <EmptyState bare icon={Inbox} title="No conversations" text="Nothing in this folder yet" />;"""),
], ['import { EmptyState } from "@/components/empty-state";'])

edit('src/app/drafts/page.tsx', [
    (""": !failed && <p className={s.quiet}>No drafts</p>}""", """: !failed && <EmptyState icon={FileText} title="No drafts" text="Messages you start and do not send are kept here" />}"""),
], ['import { EmptyState } from "@/components/empty-state";', 'import { FileText } from "lucide-react";'])

edit('src/app/settings/templates/page.tsx', [
    ("""<div className={s.empty}><h2>No templates yet</h2><p className={s.muted}>Create a template for an update, proposal or handover</p><Link href="/settings/templates/new" className={buttonClass()}>New template</Link></div>""",
     """<EmptyState icon={Layers} title="No templates yet" text="Create a template for an update, proposal or handover" action={<Link href="/settings/templates/new" className={buttonClass()}>New template</Link>} />"""),
], ['import { EmptyState } from "@/components/empty-state";', 'import { Layers } from "lucide-react";'])

edit('src/components/clients/client-directory.tsx', [
    ("""{!clients.length ? <p className={s.empty}>No clients yet. Create a client to bring their projects and conversations together.</p> : !filtered.length ? <p className={s.empty}>No clients match that search</p> :""",
     """{!clients.length ? <EmptyState icon={Users} title="No clients yet" text="Create a client to bring their projects and conversations together" /> : !filtered.length ? <EmptyState icon={Search} title="No clients match that search" text="Try part of the name or the email domain" /> :"""),
], ['import { EmptyState } from "@/components/empty-state";', 'import { Search, Users } from "lucide-react";'])

edit('src/app/settings/mailboxes/page.tsx', [
    ("""<div className={s.empty}><SettingsState empty="No mailbox connected" /><Link className={buttonClass()} href="/settings/mailboxes/connect">Connect mailbox</Link></div>""",
     """<EmptyState icon={Mail} title="No mailbox connected" text="Connect the email account you use for webmail" action={<Link className={buttonClass()} href="/settings/mailboxes/connect">Connect mailbox</Link>} />"""),
], ['import { EmptyState } from "@/components/empty-state";', 'import { Mail } from "lucide-react";'])
c = 'src/app/settings/mailboxes/page.module.css'
css = open(c, encoding='utf-8').read().replace('.empty { display: grid; justify-items: center; gap: 16px; }\n', '')
open(c, 'w', encoding='utf-8').write(css)

edit('src/components/settings/settings.tsx', [
    ('''  return <div className={s.state}>
    <ViewState loading={loading} label={error ? "This could not load" : loading ? "Getting your workspace ready." : empty} />''',
     '''  if (!loading && !error) return <EmptyState title={empty} />;
  return <div className={s.state}>
    <ViewState loading={loading} label={error ? "This could not load" : "Loading"} />'''),
], ['import { EmptyState } from "@/components/empty-state";'])
print('ok')
