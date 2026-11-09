# Phase 4 one-off: lucide icons instead of text characters standing in for icons.
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

edit('src/components/collaboration.tsx', [
    ('''                    className="shrink-0 rounded-tag px-1 text-xs text-muted opacity-0 transition-opacity duration-120 ease-standard focus-visible:opacity-100 group-hover:opacity-100"
                  >
                    ✕
                  </button>''', '''                    className="tool-icon opacity-0 focus-visible:opacity-100 group-hover:opacity-100"
                  >
                    <X size={14} aria-hidden />
                  </button>'''),
    ('import { StickyNote } from "lucide-react";', 'import { StickyNote, X } from "lucide-react";'),
])

edit('src/components/thread-linker.tsx', [
    ('''            <button
              className="tool-link"
              onClick={() => unlinkCompany.mutate()}
              title="Unlink from this client"
            >
              ✕
            </button>''', '''            <button
              className="tool-icon"
              onClick={() => unlinkCompany.mutate()}
              title="Unlink from this client"
              aria-label="Unlink from this client"
            >
              <X size={14} aria-hidden />
            </button>'''),
    ('''                    <button
                      className="tool-link"
                      onClick={() =>
                        linked
                          ? unlinkProject.mutate(p.id)
                          : linkProject.mutate(p.id)
                      }
                    >
                      {linked ? "✕" : "+"}
                    </button>''', '''                    <button
                      className="tool-icon"
                      aria-label={linked ? `Unlink ${p.name}` : `Link ${p.name}`}
                      title={linked ? "Unlink project" : "Link project"}
                      onClick={() =>
                        linked
                          ? unlinkProject.mutate(p.id)
                          : linkProject.mutate(p.id)
                      }
                    >
                      {linked ? <X size={14} aria-hidden /> : <Plus size={14} aria-hidden />}
                    </button>'''),
], ['import { Plus, X } from "lucide-react";'])

edit('src/components/mail/recipient-field.tsx', [
    ('''onClick={() => onChange(list.filter((_, i) => i !== index).join(", "))}>×</button>''', '''onClick={() => onChange(list.filter((_, i) => i !== index).join(", "))}><X size={14} aria-hidden /></button>'''),
], ['import { X } from "lucide-react";'])

edit('src/app/settings/profile/page.tsx', [
    ('''<span aria-hidden="true">{rule.met ? "✓" : "○"}</span> {rule.label}''', '''{rule.met ? <Check size={14} aria-hidden /> : <Circle size={14} aria-hidden />}{rule.label}'''),
], ['import { Check, Circle } from "lucide-react";'])

edit('src/app/settings/mailboxes/connect/page.tsx', [
    ('''<span aria-hidden="true">{step.state === "complete" ? "✓" : step.state === "error" ? "!" : index + 1}</span>''', '''<span className={s.checkMark} aria-hidden="true">{step.state === "complete" ? <Check size={14} /> : step.state === "error" ? <CircleAlert size={14} /> : index + 1}</span>'''),
], ['import { Check, CircleAlert } from "lucide-react";'])
c = 'src/app/settings/mailboxes/connect/page.module.css'
css = open(c, encoding='utf-8').read()
css = css.replace('width: 28px; height: 28px; border: 1px solid var(--line); border-radius: 50%;', 'width: 28px; height: 28px; border: 1px solid var(--line); border-radius: var(--radius-tag);')
open(c, 'w', encoding='utf-8').write(css)
print('ok')
