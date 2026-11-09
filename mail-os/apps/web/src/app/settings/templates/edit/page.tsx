"use client";

/**
 * Writing a template.
 *
 * The stored shape has not changed : HTML with `{{placeholder}}` names, plus a list
 * of which names the template declares. What changed is that none of that is typed
 * by hand any more:
 *
 *   - the body is written in the composer's editor, and placeholders show as named
 *     chips ("Client's name") rather than braces, via encode/decode;
 *   - the declared list is derived from the body and subject, so it cannot drift out
 *     of step with what the template actually uses : the field that used to ask for
 *     it, comma-separated and identifier-shaped, is gone;
 *   - the preview refreshes itself instead of waiting for a button.
 */

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Code2 } from "lucide-react";
import { api } from "@/lib/api";
import { Segmented } from "@/components/signal";
import { RichTextEditor } from "@/components/editor";
import { EditorMergeFieldMenu, MergeFieldMenu } from "@/components/merge-field-menu";
import { ViewState, Button, ErrorText, Hint, Input, Label } from "@/components/ui";
import { exampleFor, fromChips, labelFor, toChips, variablesIn } from "@/lib/merge-fields";
import type { EmailTemplateDto, EmailTemplateUpsertRequest } from "@kompanion/types";
import s from "./page.module.css";
import { PageHeader } from "@/components/page-header";

export default function TemplateEditorPage() {
  return <Suspense fallback={<ViewState loading label="Loading template" />}><EditorLookup /></Suspense>;
}

function EditorLookup() {
  const id = useSearchParams().get("id") ?? "";
  return id ? <TemplateEditor key={id} id={id} /> : <p>Choose a template from the library.</p>;
}

function TemplateEditor({ id }: { id: string }) {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["template", id],
    queryFn: () => api.getTemplate(id),
  });
  const [edit, setEdit] = useState<EmailTemplateUpsertRequest | null>(null);
  const [showCode, setShowCode] = useState(false);
  const base: EmailTemplateUpsertRequest | null = data ? ToRequest(data) : null;
  const effective = edit ?? base;

  // The body is the declaration. Anything typed into the code view or pasted in
  // counts too, which the hand-kept list never did.
  const variables = useMemo(
    () => variablesIn(effective?.subject, effective?.bodyHtml),
    [effective?.subject, effective?.bodyHtml]
  );

  const save = useMutation({
    mutationFn: (request: EmailTemplateUpsertRequest) => api.updateTemplate(id, request),
    onSuccess: (saved, request) => {
      queryClient.setQueryData(["template", id], saved);
      setEdit(current => current && JSON.stringify({ ...current, variables: variablesIn(current.subject, current.bodyHtml) }) !== JSON.stringify(request) ? current : null);
      void queryClient.invalidateQueries({ queryKey: ["templates"] });
      void queryClient.invalidateQueries({ queryKey: ["template-previews"] });
    },
  });

  function update<K extends keyof EmailTemplateUpsertRequest>(
    key: K,
    value: EmailTemplateUpsertRequest[K]
  ) {
    if (!base) return;
    setEdit((curr) => ({ ...(curr ?? base), [key]: value }));
  }

  if (isLoading) return <ViewState loading label="Loading template" />;
  if (!effective) return <p role="alert">Could not load this template.</p>;
  const dirty = edit !== null;

  return (
    <div className={s.page}>
      <PageHeader context="Templates" contextHref="/settings/templates" title={effective.name || "Untitled template"}
        description="Write it once. The tags you drop in are swapped for each client's real details when you send"
        action={<>
          {dirty && (
            <Button variant="ghost" onClick={() => setEdit(null)} disabled={save.isPending}>
              Undo my changes
            </Button>
          )}
          <Button onClick={() => save.mutate({ ...effective, variables })} disabled={save.isPending || !dirty || !effective.name.trim()}>
            {save.isPending ? "Saving..." : dirty ? "Save" : "Saved"}
          </Button>
        </>} />

      <div className={s.workspace}>
        <div className={s.editing}>
          <section className={s.panel}>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <Label htmlFor="tname">Template name</Label>
                <Input
                  id="tname"
                  value={effective.name}
                  onChange={(e) => update("name", e.target.value)}
                />
                <Hint>Only you see this. It is how you pick the template later.</Hint>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="tdesc">What it&apos;s for</Label>
                <Input
                  id="tdesc"
                  value={effective.description ?? ""}
                  onChange={(e) => update("description", e.target.value)}
                  placeholder="Weekly update for live campaigns"
                />
                <Hint>A reminder for you and your team. Optional.</Hint>
              </div>
            </div>
          </section>

          <section className={s.panel}>
            <SubjectField
              value={effective.subject ?? ""}
              onChange={(v) => update("subject", v)}
            />
          </section>

          <section className={s.panel}>
            {/* Not a <label>: the editing surface is a contenteditable div, which a
                label cannot be associated with. It carries its own aria-label. */}
            <div className="mb-2 text-xs font-medium text-muted">
              Message
            </div>
            <div className="editor-box">
              <RichTextEditor
                html={effective.bodyHtml ?? ""}
                onHtmlChange={(v) => update("bodyHtml", v)}
                ariaLabel="Message"
                placeholder="Hi there, here's this week's update…"
                encode={toChips}
                decode={fromChips}
                className="[--editor-pad-x:16px]"
                size="tall"
                tools={<EditorMergeFieldMenu />}
              />
            </div>

            <UsedFields tokens={variables} />

            <div className="mt-4">
              <button
                type="button"
                className="quote-toggle"
                onClick={() => setShowCode((v) => !v)}
                aria-expanded={showCode}
              >
                <Code2 size={14} />
                {showCode ? "Hide the code" : "Edit the code"}
                <ChevronDown
                  size={14}
                  className="transition-transform duration-200 ease-standard"
                  style={showCode ? { transform: "rotate(180deg)" } : undefined}
                />
              </button>
              {showCode && (
                <div className="disclosure mt-3 flex flex-col gap-2">
                  <textarea
                    value={effective.bodyHtml ?? ""}
                    onChange={(e) => update("bodyHtml", e.target.value)}
                    rows={12}
                    aria-label="Message code"
                    className="glass-input min-h-56 font-mono text-xs"
                  />
                  <Hint>
                    The same message as HTML. Tags are written{" "}
                    <code className="font-mono">{"{{client_name}}"}</code> here.
                  </Hint>
                </div>
              )}
            </div>
          </section>

          <section className={s.panel}>
            <label className="flex items-start gap-3 text-sm">
              <input
                type="checkbox"
                className="mt-1"
                checked={effective.skipBrandWrap}
                onChange={(e) => update("skipBrandWrap", e.target.checked)}
              />
              <span className="text-sm">
                Send this one plain
                <Hint className="mt-1 block">
                  Leaves off your logo bar, sign-off, small print and colours. Useful for
                  a short internal note.
                </Hint>
              </span>
            </label>
          </section>

          <ErrorText>{save.error instanceof Error ? save.error.message : null}</ErrorText>
        </div>

        <Preview
          subject={effective.subject ?? null}
          bodyHtml={effective.bodyHtml ?? null}
          variables={variables}
          skipBrandWrap={effective.skipBrandWrap}
        />
      </div>
    </div>
  );
}

/**
 * The subject line, with its own insert menu.
 *
 * A plain input, so the placeholder goes in as text rather than a chip : there is
 * nowhere to render one. It lands at the caret rather than at the end, because a
 * subject is usually personalised in the middle ("Update on <project>").
 */
function SubjectField({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  // Tracked on every interaction: reading selectionStart after the menu has been
  // clicked gives the end of the value, because the input lost focus in between.
  const caret = useRef<number | null>(null);

  function remember() {
    caret.current = input.current?.selectionStart ?? null;
  }

  function insert(token: string) {
    const at = caret.current ?? value.length;
    const next = `${value.slice(0, at)}{{${token}}}${value.slice(at)}`;
    onChange(next);
    const after = at + token.length + 4;
    caret.current = after;
    // After React has written the new value, or the caret is put back before the
    // text it is meant to sit after.
    requestAnimationFrame(() => {
      input.current?.focus();
      input.current?.setSelectionRange(after, after);
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor="tsubject">Subject line</Label>
        <MergeFieldMenu label="Insert a tag" onPick={(f) => insert(f.token)} />
      </div>
      <Input
        id="tsubject"
        ref={input}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          remember();
        }}
        onKeyUp={remember}
        onClick={remember}
        onBlur={remember}
        placeholder="Update on your campaign"
      />
      <Hint>What your client sees in their inbox list.</Hint>
    </div>
  );
}

/** The tags this template uses, named rather than listed as identifiers. */
function UsedFields({ tokens }: { tokens: string[] }) {
  if (!tokens.length) {
    return (
      <Hint className="mt-2 block">
        No tags yet. Use <strong>Insert field</strong> above to drop in a client&apos;s
        name or a project.
      </Hint>
    );
  }
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <span className="text-xs text-muted">
        Fills in per client:
      </span>
      {tokens.map((t) => (
        <span key={t} className="mf-chip mf-chip-static text-xs">
          {labelFor(t)}
        </span>
      ))}
    </div>
  );
}

/**
 * The finished email, rendered by the server with example values and the brand kit
 * around it.
 *
 * Refreshed on a timer rather than a button: the old screen needed "Refresh
 * preview" pressed to show anything, so most edits were made against a preview of
 * an earlier draft. `keepPreviousData` holds the last render while the next one is
 * in flight, which stops the panel blanking between keystrokes.
 */
function Preview({
  subject,
  bodyHtml,
  variables,
  skipBrandWrap,
}: {
  subject: string | null;
  bodyHtml: string | null;
  variables: string[];
  skipBrandWrap: boolean;
}) {
  const [values, setValues] = useState<Record<string, string>>( {} );
  const [device, setDevice] = useState<"desktop" | "phone">("desktop");
  const request = useMemo(
    () => ({ subject, bodyHtml, variables, skipBrandWrap, values }),
    [subject, bodyHtml, variables, skipBrandWrap, values]
  );
  const [settled, setSettled] = useState(request);

  useEffect(() => {
    const timer = setTimeout(() => setSettled(request), 500);
    return () => clearTimeout(timer);
  }, [request]);

  const { data, isError } = useQuery({
    queryKey: ["template-preview", settled],
    queryFn: () => api.previewTemplate(settled),
    placeholderData: keepPreviousData,
  });

  return (
    <aside className={s.preview}>
      <div className={s.previewHead}><span>Recipient preview</span><Segmented label="Preview device" value={device} onChange={setDevice} options={[{ value: "desktop", label: "Desktop" }, { value: "phone", label: "Phone" }]} /></div>
      <DevicePreview key={device} device={device} html={data?.bodyHtml ?? "<p style='font-family:sans-serif;padding:16px'>Start writing to see the email.</p>"} />
      <div className={s.previewSubject} role={isError ? "alert" : undefined}>
        {isError
          ? "Could not build the preview just now."
          : `Subject: ${data?.subject || "(none)"}`}
      </div>
      {variables.length > 0 && <fieldset className={s.samples}><legend>Sample values for the preview</legend>{variables.map(token => <label key={token}>{labelFor(token)}<input value={values[token] ?? ""} placeholder={exampleFor(token) || labelFor(token)} onChange={event => setValues(current => ({ ...current, [token]: event.target.value }))} /></label>)}</fieldset>}
    </aside>
  );
}

function DevicePreview({ device, html }: { device: "desktop" | "phone"; html: string }) {
  const viewport = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const canvas = device === "desktop" ? 640 : 360;
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    if (viewport.current) observer.observe(viewport.current);
    return () => observer.disconnect();
  }, []);
  const scale = Math.min(1, width / canvas);
  return <div className={s.device} data-device={device}><div ref={viewport} className={s.viewport}>
    {scale > 0 && <iframe title="Preview" srcDoc={html} className={s.frame} sandbox="" style={{ width: canvas, height: 540 / scale, transform: `scale(${scale})` }} />}
  </div></div>;
}

function ToRequest(t: EmailTemplateDto): EmailTemplateUpsertRequest {
  return {
    name: t.name,
    description: t.description,
    subject: t.subject,
    bodyHtml: t.bodyHtml,
    variables: t.variables,
    skipBrandWrap: t.skipBrandWrap,
  };
}
