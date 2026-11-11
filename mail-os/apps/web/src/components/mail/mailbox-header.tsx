"use client";

import { useCallback, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import type { MailboxStatusDto } from "@kompanion/types";
import { Popover, useDismissable } from "@/components/popover";
import { formatWhen } from "@/lib/format";
import s from "@/app/mail/page.module.css";

/** Plain words for a mailbox's sync health, shown under its address. */
export function syncLabel(mailbox: Pick<MailboxStatusDto, "syncState" | "lastSyncCompletedAt">): string {
  if (mailbox.syncState === "Error") return "Sync stopped";
  if (mailbox.syncState === "Syncing") {
    const when = formatWhen(mailbox.lastSyncCompletedAt);
    return when ? `Synced ${/^\d{1,2}:\d{2}$/.test(when) ? "at" : "on"} ${when}` : "Synced";
  }
  return "Syncing";
}

/**
 * The mailbox you are reading, at the top of the list. With more than one mailbox
 * it opens a menu to switch; with one it is plain text, since there is nothing to pick.
 */
export function MailboxHeader({ mailboxes, currentId, onPick }: {
  mailboxes: MailboxStatusDto[]; currentId: string | null; onPick: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const ref = useDismissable<HTMLDivElement>(open, close);
  const current = mailboxes.find((m) => m.id === currentId) ?? mailboxes[0];
  if (!current) return null;

  const body = <>
    <span className={s.mailboxDot} data-state={current.syncState} aria-hidden />
    <span className={s.mailboxText}><b>{current.email}</b><small>{syncLabel(current)}</small></span>
  </>;

  if (mailboxes.length < 2) return <div className={s.mailboxHeader} aria-label="Mailbox">{body}</div>;

  return <div className={s.mailboxPicker} ref={ref}>
    <button type="button" className={s.mailboxHeader} aria-haspopup="menu" aria-expanded={open}
      aria-label={`Mailbox ${current.email}. Switch mailbox`} onClick={() => setOpen((v) => !v)}>
      {body}<ChevronDown size={16} aria-hidden className={s.mailboxChevron} />
    </button>
    <Popover open={open} role="menu" className={s.mailboxMenu}>
      {mailboxes.map((mailbox) => <button key={mailbox.id} type="button" role="menuitemradio"
        aria-checked={mailbox.id === current.id} onClick={() => { close(); if (mailbox.id !== current.id) onPick(mailbox.id); }}>
        <span className={s.mailboxText}><b>{mailbox.email}</b><small>{syncLabel(mailbox)}</small></span>
        {mailbox.id === current.id && <Check size={14} aria-hidden />}
      </button>)}
    </Popover>
  </div>;
}
