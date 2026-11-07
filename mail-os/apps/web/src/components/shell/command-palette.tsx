"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ArrowUpRight, Search, X } from "lucide-react";
import { Button } from "@/components/ui";
import { ShellDialog } from "./dialog";

export interface Command { id: string; label: string; group: string; keywords?: string; run: () => void }

export function filterCommands(commands: Command[], query: string) {
  const words = query.trim().toLowerCase().split(/\s+/);
  return commands.filter((command) => words.every((word) =>
    `${command.label} ${command.group} ${command.keywords ?? ""}`.toLowerCase().includes(word)));
}

export function CommandPalette({ open, onClose, commands, onSearch }: {
  open: boolean; onClose: () => void; commands: Command[]; onSearch: (query: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const id = useId();
  const filtered = filterCommands(commands, query);
  const items = query.trim() ? [...filtered, {
    id: "search-mail", label: `Search mail for "${query.trim()}"`, group: "Search",
    run: () => onSearch(query.trim()),
  }] : filtered;
  const selected = Math.min(active, Math.max(0, items.length - 1));

  useEffect(() => { if (open) input.current?.focus(); }, [open]);
  useEffect(() => {
    if (open) document.getElementById(`${id}-${selected}`)?.scrollIntoView?.({ block: "nearest" });
  }, [open, selected, id]);
  // Close the native dialog at once, skipping the exit fade: while it stays modal the next
  // view (for example the composer) cannot take focus, and the delayed close would then
  // return focus behind it.
  function choose(command: Command) {
    const dialog = input.current?.closest("dialog");
    if (dialog?.open) dialog.close?.();
    onClose();
    command.run();
  }

  return (
    <ShellDialog open={open} onClose={onClose} labelId={`${id}-title`} className="signal-palette">
      <h2 id={`${id}-title`} className="sr-only">Search or jump to</h2>
      <div className="signal-command-input">
        <Search size={19} aria-hidden />
        <input ref={input} autoFocus role="combobox" aria-expanded={open} aria-controls={`${id}-list`}
          aria-activedescendant={items.length ? `${id}-${selected}` : undefined}
          aria-autocomplete="list" aria-label="Search routes, actions or mail"
          placeholder="Search or jump to" value={query}
          onChange={(event) => { setQuery(event.target.value); setActive(0); }}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              setActive((selected + (event.key === "ArrowDown" ? 1 : -1) + items.length) % (items.length || 1));
            } else if (event.key === "Enter" && items[selected]) {
              event.preventDefault(); choose(items[selected]);
            }
          }} />
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close command palette"><X size={17} /></Button>
      </div>
      <div role="listbox" id={`${id}-list`} aria-label="Routes and actions" className="signal-command-list">
        {items.map((command, index) => (
          <button key={command.id} id={`${id}-${index}`} role="option" aria-selected={selected === index}
            tabIndex={-1} onPointerMove={() => setActive(index)} onClick={() => choose(command)}>
            <ArrowUpRight size={16} aria-hidden /><span>{command.label}</span><small>{command.group}</small>
          </button>
        ))}
      </div>
      <div className="signal-command-help"><span>Arrow keys to move / Enter to open</span><kbd>Esc</kbd></div>
    </ShellDialog>
  );
}
