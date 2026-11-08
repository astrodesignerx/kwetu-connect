"use client";

/**
 * The "Insert field" picker.
 *
 * Replaces the instruction "type {{client_name}} and then list it in the variables
 * box" with picking "Client's name" off a menu. The caller decides what to do with
 * the choice. The rich text editor drops a chip at the caret and the subject line
 * inserts the raw placeholder, so this component only has to choose, not insert.
 *
 * Every item shows the example value the preview will use, because "Click rate"
 * and "2.98%" together answer the question people actually have, which is what
 * their client will end up reading.
 */

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Plus } from "lucide-react";
import { cn } from "@/lib/cn";
import { useEditorTools } from "@/components/editor";
import { Popover } from "@/components/popover";
import { MERGE_FIELD_GROUPS, chipHtml, type MergeField } from "@/lib/merge-fields";

export function MergeFieldMenu({
  onPick,
  label = "Insert field",
  compact = false,
}: {
  onPick: (field: MergeField) => void;
  label?: string;
  /** Icon-width trigger, for the editor toolbar where space is tight. */
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        // Without this the trigger takes focus on press and the editor loses the
        // caret the chip was meant to land at.
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        title="Insert a detail that gets filled in per client"
        className={cn(
          compact
            ? cn("editor-tool w-auto gap-1 px-2 text-xs font-medium", open && "editor-tool-active")
            : "mf-trigger",
          !compact && open && "mf-trigger-open"
        )}
      >
        <Plus size={compact ? 14 : 14} />
        {label}
        <ChevronDown
          size={14}
         
          className="transition-transform duration-120 ease-standard"
          style={open ? { transform: "rotate(180deg)" } : undefined}
        />
      </button>

      <Popover open={open} role="menu" className="mf-menu">
          <p className="mf-menu-intro">
            Pick a detail to drop in. It shows as a tag while you write, and is swapped
            for the real value when the email goes out.
          </p>
          {MERGE_FIELD_GROUPS.map((group) => (
            <div key={group.title} className="mf-menu-group">
              <div className="mf-menu-title">{group.title}</div>
              {group.fields.map((field) => (
                <button
                  key={field.token}
                  type="button"
                  role="menuitem"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    onPick(field);
                    setOpen(false);
                  }}
                  className="mf-menu-item"
                >
                  <span className="truncate">{field.label}</span>
                  <span className="mf-menu-example">{field.example}</span>
                </button>
              ))}
            </div>
          ))}
      </Popover>
    </div>
  );
}

/**
 * The same menu, wired to drop a chip at the caret. Belongs in a `RichTextEditor`
 * `tools` slot; it reads the insert handle from there rather than being handed one.
 */
export function EditorMergeFieldMenu() {
  const { insertHtml } = useEditorTools();
  return (
    <MergeFieldMenu
      compact
      label="Insert field"
      // The trailing space keeps the caret outside the chip: without it the next
      // thing typed lands inside a block that is not editable, and is dropped.
      onPick={(f) => insertHtml(`${chipHtml(f.token)}&nbsp;`)}
    />
  );
}
