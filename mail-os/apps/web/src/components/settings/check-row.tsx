"use client";

import { Check } from "lucide-react";
import s from "./check-row.module.css";

export function CheckRow({ label, detail, checked, disabled = false, reason, onChange }: {
  label: string; detail?: string; checked: boolean; disabled?: boolean; reason?: string;
  onChange: (checked: boolean) => void;
}) {
  return <label className={s.row} data-locked={disabled && checked && !!reason} title={[label, detail, reason].filter(Boolean).join(" / ")}>
    <input type="checkbox" aria-label={[label, detail, reason].filter(Boolean).join(" ")} checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} />
    <span className={s.box} aria-hidden="true"><Check size={14} /></span>
    <span className={s.text}><span>{label}</span>{detail && <small>{detail}</small>}</span>
    {reason && <small className={s.reason}>{reason}</small>}
  </label>;
}
