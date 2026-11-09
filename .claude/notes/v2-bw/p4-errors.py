# Phase 4 one-off: page-level failures use ErrorState, inline failures use ErrorText.
# Both carry the line alert icon and the exact message. Run from mail-os/apps/web.
def edit(p, pairs, imps=()):
    s = open(p, encoding='utf-8').read()
    for a, b in pairs:
        assert a in s, (p, a[:80])
        s = s.replace(a, b)
    for imp in imps:
        if imp not in s:
            lines = s.split('\n')
            first = next(i for i, l in enumerate(lines) if l.startswith('import '))
            lines.insert(first, imp)
            s = '\n'.join(lines)
    open(p, 'w', encoding='utf-8').write(s)

ES = 'import { ErrorState } from "@/components/empty-state";'

edit('src/app/mail/page.tsx', [
    ("""  if (overviewError) return <div className={s.quiet} role="alert">Mailboxes could not load. <button onClick={() => void reloadOverview()}>Try again</button></div>;""",
     """  if (overviewError) return <div className={s.noMailbox}><ErrorState title="Mailboxes could not load" message="Check your connection, then try again" onRetry={() => void reloadOverview()} /></div>;"""),
    ("""{(move.isError || bulkArchive.isError || setRead.isError) && <p className={s.quiet} role="alert">The mail action could not finish. Try again using its control.</p>}""",
     """{(move.isError || bulkArchive.isError || setRead.isError) && <div className={s.actionError}><ErrorText>The mail action could not finish. Try again using its control.</ErrorText></div>}"""),
    ("""threadError ? <div className={`${s.quiet} ${s.readerState}`} role="alert">Could not open this conversation. <button onClick={() => void refetchThread()}>Try again</button><button onClick={() => setParam('id', null)}>Back to inbox</button></div> :""",
     """threadError ? <ErrorState className={s.readerState} title="Could not open this conversation" message="It may have moved. Try again or go back to the inbox." action={<div className={s.errorActions}><Button variant="default" onClick={() => void refetchThread()}>Try again</Button><Button variant="ghost" onClick={() => setParam('id', null)}>Back to inbox</Button></div>} /> :"""),
    ("""{threadsError ? <div className={s.quiet} role="alert">Messages could not load. <button onClick={() => void refetchThreads()}>Try again</button></div> :""",
     """{threadsError ? <ErrorState bare title="Messages could not load" onRetry={() => void refetchThreads()} /> :"""),
    ("""{syncError && <div className={s.quiet} role="alert">This mailbox stopped syncing: {syncError} <Button variant="ghost" onClick={onRetrySync} disabled={retrying}>Retry</Button></div>}""",
     """{syncError && <div className={s.syncError}><ErrorText>This mailbox stopped syncing: {syncError}</ErrorText><Button variant="default" size="small" onClick={onRetrySync} disabled={retrying}>Retry</Button></div>}"""),
], [ES])

edit('src/app/clients/detail/page.tsx', [
    ("""  if (company.isError) return <div role="alert"><p>{company.error.message}</p><Link href="/clients">Back to clients</Link></div>;""",
     """  if (company.isError) return <ErrorState title="This client could not load" message={company.error.message} action={<Link href="/clients" className={buttonClass("default")}>Back to clients</Link>} />;"""),
    ('import { Button, ViewState } from "@/components/ui";', 'import { Button, ViewState, buttonClass } from "@/components/ui";'),
], [ES])

edit('src/app/clients/page.tsx', [
    ("""<div className={s.panel} role="alert"><p>Could not load clients</p><Button variant="default" onClick={() => void query.refetch()}>Try again</Button></div>""",
     """<ErrorState title="Could not load clients" message={query.error.message} onRetry={() => void query.refetch()} />"""),
], [ES])

edit('src/app/drafts/page.tsx', [
    ("""{remove.isError && <p role="alert">Could not discard this draft. Try again.</p>}""", """{remove.isError && <ErrorText>Could not discard this draft. Try again.</ErrorText>}"""),
    ("""{failed && <p role="alert" className={s.quiet}>Drafts could not load. <button onClick={() => { void overview.refetch(); void saved.refetch(); }}>Try again</button></p>}""",
     """{failed && <ErrorState title="Drafts could not load" onRetry={() => { void overview.refetch(); void saved.refetch(); }} />}"""),
], [ES, 'import { ErrorText } from "@/components/ui";'])

edit('src/app/settings/templates/edit/page.tsx', [
    ("""  if (!effective) return <p role="alert">Could not load this template</p>;""",
     """  if (!effective) return <ErrorState title="Could not load this template" message="It may have been deleted" action={<Link href="/settings/templates" className={buttonClass("default")}>Back to templates</Link>} />;"""),
], [ES])

edit('src/components/mail/morning-brief.tsx', [
    ("""  if (isError || !data) return <section className={s.quiet} role="alert">Your brief could not load. <button onClick={() => void refetch()}>Try again</button></section>;""",
     """  if (isError || !data) return <ErrorState bare title="Your brief could not load" onRetry={() => void refetch()} />;"""),
], [ES])

edit('src/components/clients/client-projects.tsx', [
    ("""<div role="alert"><p>Could not load all project flights</p><Button variant="default" onClick={() => queries.forEach(q => void q.refetch())}>Try again</Button></div>""", """<ErrorState bare title="Could not load all project flights" onRetry={() => queries.forEach(q => void q.refetch())} />"""),
], [ES])

edit('src/components/settings/settings.tsx', [
    ("""  if (!loading && !error) return <EmptyState title={empty} />;""", """  if (error) return <ErrorState title="This could not load" message={error instanceof Error ? error.message : "Please try again"} onRetry={retry} />;
  if (!loading) return <EmptyState title={empty} />;"""),
    ("""  if (error) return <p className={s.feedback} role="alert">{error instanceof Error ? error.message : String(error)}</p>;""",
     """  if (error) return <div className={s.feedback}><ErrorText>{error instanceof Error ? error.message : String(error)}</ErrorText></div>;"""),
    ('import { EmptyState } from "@/components/empty-state";', 'import { EmptyState, ErrorState } from "@/components/empty-state";'),
])

# Inline mutation errors get the alert icon.
for p, a in [
    ('src/app/settings/templates/new/page.tsx', '<p role="alert" className={s.error}>{create.error.message}</p>'),
    ('src/app/settings/templates/page.tsx', '<p role="alert" className={s.error}>{remove.error.message}</p>'),
    ('src/components/clients/client-form.tsx', '<p className={s.error} role="alert">{save.error.message}</p>'),
    ('src/components/clients/client-projects.tsx', '<p className={s.error} role="alert">{removeFlight.error.message}</p>'),
    ('src/components/clients/client-projects.tsx', '<p role="alert" className={s.error}>{removeProject.error.message}</p>'),
    ('src/components/clients/client-projects.tsx', '<p role="alert" className={f.error}>{save.error.message}</p>'),
    ('src/components/clients/flight-form.tsx', '<p className={s.error} role="alert">{error ?? save.error?.message}</p>'),
    ('src/components/collaboration.tsx', '<p role="alert" className="text-xs">Could not change the assignment. Try again.</p>'),
    ('src/components/mail/attachment-preview.tsx', '<p role="alert">Preview could not load. Try downloading the file.</p>'),
    ('src/components/mail/conversation-context.tsx', '<p role="alert">Could not change the conversation state. Try again.</p>'),
    ('src/components/mail/conversation-context.tsx', '<p role="alert" className={s.muted}>This template could not open. Try again.</p>'),
]:
    inner = a[a.index('>') + 1:a.rindex('</p>')]
    edit(p, [(a, '<ErrorText>' + inner + '</ErrorText>')], ['import { ErrorText } from "@/components/ui";'])
print('ok')
