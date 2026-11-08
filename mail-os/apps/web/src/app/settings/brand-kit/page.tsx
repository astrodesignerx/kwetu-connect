"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ImagePlus, PanelTop } from "lucide-react";
import type { BrandKitDto, BrandKitUpsertRequest } from "@kompanion/types";
import { api } from "@/lib/api";
import { headerBarHtml, renderBrandPreview } from "@/lib/brand-preview";
import { RichTextEditor, useEditorTools } from "@/components/editor";
import { Button, Input } from "@/components/ui";
import { Feedback, Field, Panel, SettingsHeader, SettingsState } from "@/components/settings/settings";
import s from "./page.module.css";

export default function BrandKitPage() {
  const queryClient = useQueryClient();
  const kit = useQuery({ queryKey: ["brand-kit"], queryFn: api.getBrandKit });
  const [edit, setEdit] = useState<BrandKitUpsertRequest | null>(null);
  const base = kit.data ? toRequest(kit.data) : null;
  const effective = edit ?? base;
  const save = useMutation({
    mutationFn: (request: BrandKitUpsertRequest) => api.updateBrandKit(request),
    onSuccess: async () => {
      setEdit(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["brand-kit"] }),
        queryClient.invalidateQueries({ queryKey: ["template-previews"] }),
      ]);
    },
  });
  function update<K extends keyof BrandKitUpsertRequest>(key: K, value: BrandKitUpsertRequest[K]) {
    if (!base) return;
    save.reset();
    setEdit((current) => ({ ...(current ?? base), [key]: value }));
  }
  if (kit.isPending) return <SettingsState loading />;
  if (kit.isError || !effective) return <SettingsState error={kit.error ?? new Error("Email appearance is unavailable.")} retry={() => void kit.refetch()} />;

  return <div className={s.page}>
    <SettingsHeader title="Email appearance" context="Settings / Workspace" description="A consistent identity on every message you send." />
    <div className={s.layout}>
      <div className={s.controls}><fieldset className={s.editable} disabled={save.isPending} inert={save.isPending}>
        <Panel><h2>Your business</h2><div className={s.fields}>
          <Field label="Organisation name" htmlFor="brand-name"><Input id="brand-name" value={effective.name ?? ""} onChange={(event) => update("name", event.target.value)} /></Field>
          <Field label="Logo URL" htmlFor="brand-logo" hint="Use an image hosted online so recipients can see it."><Input id="brand-logo" type="url" placeholder="https://example.com/logo.png" value={effective.logoUrl ?? ""} onChange={(event) => update("logoUrl", event.target.value)} /></Field>
        </div>{effective.logoUrl && <div className={s.logo}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={effective.logoUrl} alt="Your logo" />
        </div>}</Panel>
        <Panel><h2>Colours</h2><div className={s.colours}>{([
          ["primaryColor", "Header bar"], ["accentColor", "Links"], ["textColor", "Text"], ["backgroundColor", "Background"],
        ] as const).map(([key, label]) => <Field key={key} label={label} htmlFor={"brand-" + key}><div className={s.colour}>
          <input type="color" aria-label={label + " colour picker"} value={/^#[0-9a-f]{6}$/i.test(effective[key] ?? "") ? effective[key]! : "#FBB040"} onChange={(event) => update(key, event.target.value.toUpperCase())} />
          <Input id={"brand-" + key} value={effective[key] ?? ""} placeholder="#FBB040" onChange={(event) => update(key, event.target.value)} />
        </div></Field>)}</div></Panel>
        <Panel><h2>Top of the email</h2><p className={s.note}>Leave empty for a plain email, or add a header bar.</p><EditorBox label="Top of the email" html={effective.headerHtml ?? ""} onChange={(html) => update("headerHtml", html)} tools={<HeaderButton background={effective.primaryColor || "#FBB040"} logoUrl={effective.logoUrl} name={effective.name} />} /></Panel>
        <Panel><h2>Your sign-off</h2><p className={s.note}>Added after your message, below a thin line.</p><EditorBox label="Your sign-off" html={effective.signatureHtml ?? ""} onChange={(html) => update("signatureHtml", html)} /></Panel>
        <Panel><h2>Small print</h2><EditorBox label="Small print" html={effective.footerHtml ?? ""} onChange={(html) => update("footerHtml", html)} /></Panel>
        <details className={s.code}><summary>Edit the HTML</summary><Panel>{([
          ["headerHtml", "Top of the email"], ["signatureHtml", "Your sign-off"], ["footerHtml", "Small print"],
        ] as const).map(([key, label]) => <Field key={key} label={label} htmlFor={"code-" + key}><textarea id={"code-" + key} className="glass-input" rows={5} value={effective[key] ?? ""} onChange={(event) => update(key, event.target.value)} /></Field>)}</Panel></details>
      </fieldset><Feedback error={save.error} message={save.isSuccess && !edit ? "Email appearance saved." : null} />
      <div className={s.actions}>{edit && <Button variant="ghost" disabled={save.isPending} onClick={() => { setEdit(null); save.reset(); }}>Undo my changes</Button>}<Button disabled={save.isPending || !edit} onClick={() => save.mutate(effective)}>{save.isPending ? "Saving..." : edit ? "Save changes" : "Saved"}</Button></div>
      </div>
      <LivePreview kit={effective} />
    </div>
  </div>;
}

function LivePreview({ kit }: { kit: BrandKitUpsertRequest }) {
  const html = useMemo(() => renderBrandPreview(kit), [kit]);
  const [shown, setShown] = useState(html);
  useEffect(() => { const timer = setTimeout(() => setShown(html), 250); return () => clearTimeout(timer); }, [html]);
  return <aside className={s.previewStage}><div className={s.previewLabel}><b>Live preview</b><span>Phone / mail app</span></div><div className={s.phone}><div className={s.phoneBar} aria-hidden="true" /><iframe title="Preview of a branded email" sandbox="" srcDoc={shown} /></div><p className={s.note}>Example message. Your real text goes in the middle.</p></aside>;
}

function EditorBox({ label, html, onChange, tools }: { label: string; html: string; onChange: (html: string) => void; tools?: React.ReactNode }) {
  return <div className={s.editor}><RichTextEditor html={html} onHtmlChange={onChange} ariaLabel={label} placeholder="Leave empty if not needed" tools={tools} /></div>;
}

function HeaderButton({ background, logoUrl, name }: { background: string; logoUrl: string | null; name: string | null }) {
  const { insertHtml } = useEditorTools();
  return <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => insertHtml(headerBarHtml({ background, logoUrl, name }))} title="Add a header bar" className="editor-tool w-auto gap-1 px-2 text-xs">{logoUrl ? <ImagePlus size={14} /> : <PanelTop size={14} />} Add a bar</button>;
}

function toRequest(kit: BrandKitDto): BrandKitUpsertRequest {
  return { name: kit.name, primaryColor: kit.primaryColor, accentColor: kit.accentColor, textColor: kit.textColor, backgroundColor: kit.backgroundColor, logoUrl: kit.logoUrl, headerHtml: kit.headerHtml, footerHtml: kit.footerHtml, signatureHtml: kit.signatureHtml };
}
