"use client";

/**
 * A small rich-text editor for the composer.
 *
 * Why hand-rolled rather than TipTap/ProseMirror: the composer needs seven commands
 * (bold, italic, underline, link, two list kinds, blockquote) over a body that the
 * server re-renders anyway, and this repo's convention is local token-styled
 * primitives rather than pulled-in widget libraries. A ProseMirror bundle is ~90KB
 * gzipped to buy formatting the recipient's mail client will re-interpret regardless.
 *
 * `document.execCommand` is deprecated and will not be removed : every engine still
 * ships it, and the supported browsers are Chromium and WebKit based. The known cost is that the HTML
 * it emits is engine-flavoured (`<b>` here, `<span style>` there). That is acceptable
 * because a source view remains available wherever it matters: anyone who needs exact
 * markup : a pasted campaign layout, a fix the toolbar cannot express : edits it
 * directly. Placeholders no longer need it; `encode`/`decode` show those as chips.
 */

import { createContext, use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Bold,
  Italic,
  Underline,
  Link2,
  List,
  ListOrdered,
  Quote,
  RemoveFormatting,
  Check,
  X,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { modKeyLabel } from "@/lib/keys";
import { sanitizeHtml } from "@/lib/sanitize-html";

type Command = "bold" | "italic" | "underline" | "insertUnorderedList" | "insertOrderedList";

/**
 * How an extra toolbar button puts something where the caret is.
 *
 * Passed by context rather than as an argument to a render prop: the handle reads
 * the surface ref, and anything the editor *calls* while rendering counts as
 * touching a ref during render. Handing the object to a provider and letting the
 * button pull it out in its own click handler keeps the read where it belongs.
 */
const EditorToolsContext = createContext<{ insertHtml: (html: string) => void } | null>(null);

/** For a control rendered into `RichTextEditor`'s `tools` slot. */
export function useEditorTools() {
  const tools = use(EditorToolsContext);
  if (!tools) {
    throw new Error("useEditorTools must be used inside a RichTextEditor tools slot");
  }
  return tools;
}

const MARKS: { cmd: Command; label: string; Icon: typeof Bold; key?: string }[] = [
  { cmd: "bold", label: "Bold", Icon: Bold, key: "B" },
  { cmd: "italic", label: "Italic", Icon: Italic, key: "I" },
  { cmd: "underline", label: "Underline", Icon: Underline, key: "U" },
];

const LISTS: { cmd: Command; label: string; Icon: typeof Bold }[] = [
  { cmd: "insertUnorderedList", label: "Bulleted list", Icon: List },
  { cmd: "insertOrderedList", label: "Numbered list", Icon: ListOrdered },
];

export function RichTextEditor({
  html,
  onHtmlChange,
  placeholder,
  ariaLabel,
  onKeyDown,
  className,
  tools,
  encode,
  decode,
  size = "default",
  stickyToolbar = false,
}: {
  html: string;
  onHtmlChange: (html: string) => void;
  placeholder?: string;
  ariaLabel: string;
  onKeyDown?: (e: React.KeyboardEvent) => void;
  className?: string;
  /**
   * Extra toolbar controls : the "Insert field" menu, the brand kit's header bar
   * button. They live inside the toolbar rather than beside it because they act on
   * the caret, which only this component knows about; they reach it with
   * `useEditorTools`.
   */
  tools?: React.ReactNode;
  /**
   * Optional translation between the value the parent stores and what the surface
   * displays : templates store `{{client_name}}` and show a named chip.
   *
   * Comparison stays in the parent's units on purpose. Browsers rewrite markup
   * around a selection as they please, so comparing rendered HTML would see a
   * difference the parent never made, re-sync the surface mid-keystroke and throw
   * the caret back to the start.
   *
   * Pass module-level functions rather than inline arrows: they are effect
   * dependencies, so a fresh identity each render re-runs the sync check on every
   * keystroke. It is harmless : the check finds the value unchanged and returns :
   * but it is work for nothing.
   */
  encode?: (stored: string) => string;
  decode?: (shown: string) => string;
  /** compact: a short surface that scrolls (the reply dock). tall: a long writing area (templates). */
  size?: "default" | "compact" | "tall";
  /** Keeps the formatting bar in view while a long message scrolls under it. */
  stickyToolbar?: boolean;
}) {
  const surface = useRef<HTMLDivElement>(null);
  // What we last handed the parent, in the parent's units. The surface is
  // uncontrolled : writing `html` back into it on every keystroke would collapse the
  // caret to the start of the node : so it is only re-synced when the value changed
  // somewhere else (a template, an AI rewrite, a switch back from source view).
  //
  // Starts as null rather than `html`: the surface is empty on mount, so seeding this
  // with the initial value made the sync effect decide it was already in step and
  // skip the one write that mattered. A composer opened on a reply, or any editor
  // mounted onto loaded data, came up blank.
  const emitted = useRef<string | null>(null);
  const [active, setActive] = useState<Record<string, boolean>>({});
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const savedRange = useRef<Range | null>(null);
  const [empty, setEmpty] = useState(!html);
  const [modKey] = useState(modKeyLabel);

  useEffect(() => {
    const el = surface.current;
    if (!el || html === emitted.current) return;
    // This is the one place stored HTML becomes live DOM in the app's own origin
    // (the reader and previews are sandboxed iframes). Template bodies, brand-kit
    // fragments and AI output all arrive here, so they are sanitized on the way in.
    el.innerHTML = sanitizeHtml(encode ? encode(html) : html);
    emitted.current = html;
    setEmpty(!el.textContent?.trim() && !el.querySelector("img,hr,table"));
  }, [html, encode]);

  const publish = useCallback(() => {
    const el = surface.current;
    if (!el) return;
    const stored = decode ? decode(el.innerHTML) : el.innerHTML;
    emitted.current = stored;
    setEmpty(!el.textContent?.trim() && !el.querySelector("img,hr,table"));
    onHtmlChange(stored);
  }, [onHtmlChange, decode]);

  // Reflect the caret's formatting in the toolbar, so the buttons report state
  // instead of only issuing commands.
  useEffect(() => {
    function onSelectionChange() {
      const el = surface.current;
      if (!el || !el.contains(document.getSelection()?.anchorNode ?? null)) return;
      setActive({
        bold: document.queryCommandState("bold"),
        italic: document.queryCommandState("italic"),
        underline: document.queryCommandState("underline"),
        insertUnorderedList: document.queryCommandState("insertUnorderedList"),
        insertOrderedList: document.queryCommandState("insertOrderedList"),
      });
    }
    document.addEventListener("selectionchange", onSelectionChange);
    return () => document.removeEventListener("selectionchange", onSelectionChange);
  }, []);

  function run(cmd: string, value?: string) {
    surface.current?.focus();
    document.execCommand(cmd, false, value);
    publish();
  }

  // Memoised so the provider does not hand every tool a new value each keystroke.
  const toolHandle = useMemo(
    () => ({
      insertHtml: (value: string) => {
        surface.current?.focus();
        document.execCommand("insertHTML", false, value);
        publish();
      },
    }),
    [publish]
  );

  /** Paste as plain text. Pasting from Word or a web page otherwise drags in a
   *  stylesheet's worth of spans that the brand kit then has to fight. */
  function onPaste(e: React.ClipboardEvent) {
    e.preventDefault();
    const text = e.clipboardData.getData("text/plain");
    document.execCommand("insertText", false, text);
    publish();
  }

  function openLink() {
    const sel = document.getSelection();
    savedRange.current = sel && sel.rangeCount ? sel.getRangeAt(0).cloneRange() : null;
    setLinkUrl("");
    setLinkOpen(true);
  }

  function applyLink() {
    const url = linkUrl.trim();
    setLinkOpen(false);
    if (!url || /^javascript:/i.test(url)) return;
    const href = /^[a-z][a-z0-9+.-]*:/i.test(url) || url.startsWith("mailto:") ? url : `https://${url}`;
    const sel = document.getSelection();
    if (savedRange.current && sel) {
      sel.removeAllRanges();
      sel.addRange(savedRange.current);
    }
    surface.current?.focus();
    if (savedRange.current?.collapsed) {
      document.execCommand("insertHTML", false, `<a href="${href}">${href}</a>`);
    } else {
      document.execCommand("createLink", false, href);
    }
    publish();
  }

  return (
    <div className={cn("flex min-h-0 flex-1 flex-col", className)}>
      <div className={cn("editor-toolbar", size !== "default" && "editor-toolbar-tight", stickyToolbar && "editor-toolbar-sticky")}>
        {MARKS.map(({ cmd, label, Icon, key }) => (
          <ToolButton
            key={cmd}
            label={key ? `${label} (${modKey}+${key})` : label}
            active={active[cmd]}
            onClick={() => run(cmd)}
          >
            <Icon size={16} />
          </ToolButton>
        ))}
        <span className="editor-sep" aria-hidden />
        <ToolButton label="Insert link" active={linkOpen} onClick={openLink}>
          <Link2 size={16} />
        </ToolButton>
        {LISTS.map(({ cmd, label, Icon }) => (
          <ToolButton key={cmd} label={label} active={active[cmd]} onClick={() => run(cmd)}>
            <Icon size={16} />
          </ToolButton>
        ))}
        <ToolButton label="Quote" onClick={() => run("formatBlock", "blockquote")}>
          <Quote size={16} />
        </ToolButton>
        <span className="editor-sep" aria-hidden />
        <ToolButton label="Clear formatting" onClick={() => run("removeFormat")}>
          <RemoveFormatting size={16} />
        </ToolButton>
        {tools && (
          <>
            <span className="editor-sep" aria-hidden />
            <EditorToolsContext value={toolHandle}>{tools}</EditorToolsContext>
          </>
        )}
      </div>

      {linkOpen && (
        <div className="editor-linkbar">
          <input
            autoFocus
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); applyLink(); }
              if (e.key === "Escape") { e.preventDefault(); setLinkOpen(false); }
            }}
            placeholder="https://example.com"
            aria-label="Link address"
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted"
          />
          <ToolButton label="Apply link" onClick={applyLink}>
            <Check size={16} />
          </ToolButton>
          <ToolButton label="Cancel link" onClick={() => setLinkOpen(false)}>
            <X size={16} />
          </ToolButton>
        </div>
      )}

      <div className="relative min-h-0 flex-1">
        {empty && placeholder && (
          <span className="editor-placeholder">{placeholder}</span>
        )}
        <div
          ref={surface}
          role="textbox"
          aria-multiline="true"
          aria-label={ariaLabel}
          contentEditable
          suppressContentEditableWarning
          spellCheck
          onInput={publish}
          onBlur={publish}
          onPaste={onPaste}
          onKeyDown={onKeyDown}
          className={cn("editor-surface", size === "compact" && "editor-surface-compact", size === "tall" && "editor-surface-tall")}
        />
      </div>
    </div>
  );
}

function ToolButton({
  label,
  active,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active ?? undefined}
      // Keeps the caret and selection in the editor: without this the button steals
      // focus on mousedown and the command applies to nothing.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={cn("editor-tool", active && "editor-tool-active")}
    >
      {children}
    </button>
  );
}
