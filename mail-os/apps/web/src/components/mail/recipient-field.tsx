"use client";

import { useRef, useState, type RefObject } from "react";
import s from "./compose.module.css";

function recipients(value: string) {
  const parts: string[] = [];
  let quoted = false, angle = false, start = 0;
  for (let index = 0; index < value.length; index++) {
    const char = value[index];
    if (char === '"' && value[index - 1] !== "\\") quoted = !quoted;
    if (!quoted && char === "<") angle = true;
    if (!quoted && char === ">") angle = false;
    if (!quoted && !angle && (char === "," || char === ";")) {
      if (value.slice(start, index).trim()) parts.push(value.slice(start, index).trim());
      start = index + 1;
    }
  }
  if (value.slice(start).trim()) parts.push(value.slice(start).trim());
  return parts;
}

export function RecipientField({ id, value, onChange, inputRef, placeholder }: {
  id: string; value: string; onChange: (value: string) => void; inputRef?: RefObject<HTMLInputElement | null>; placeholder?: string;
}) {
  const ownRef = useRef<HTMLInputElement>(null);
  const ref = inputRef ?? ownRef;
  const [editing, setEditing] = useState(false);
  const list = recipients(value);
  return <div className={s.recipients}>
    {!editing && list.map((recipient, index) => <span className={s.recipient} key={`${recipient}:${index}`}>
      <span>{recipient}</span><button type="button" aria-label={`Remove ${recipient}`} onClick={() => onChange(list.filter((_, i) => i !== index).join(", "))}>×</button>
    </span>)}
    <input id={id} ref={ref} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} autoComplete="off"
      className={`${s.recipientInput} rounded-lg`} data-chipped={!editing && list.length > 0} onFocus={() => setEditing(true)} onBlur={() => setEditing(false)} />
    {!editing && list.length > 0 && <button className={s.addRecipient} type="button" onClick={() => ref.current?.focus()}>Edit recipients</button>}
  </div>;
}
