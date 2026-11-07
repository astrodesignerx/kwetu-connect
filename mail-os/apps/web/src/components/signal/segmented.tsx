"use client";

import { useId, useRef, type KeyboardEvent } from "react";
import type { SignalStyle } from "./shared";
import s from "./signal.module.css";

export type SegmentOption<T extends string = string> = { value: T; label: string; disabled?: boolean; panelId?: string; id?: string };
export type SegmentedProps<T extends string = string> = { options: readonly SegmentOption<T>[]; value: T; onChange: (value: T) => void; label: string };

export function Segmented<T extends string>({ options, value, onChange, label }: SegmentedProps<T>) {
  const id = useId();
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const selected = options.findIndex((option) => option.value === value && !option.disabled);
  const active = selected < 0 ? options.findIndex((option) => !option.disabled) : selected;

  function handleKey(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const enabled = options.map((option, optionIndex) => option.disabled ? -1 : optionIndex).filter((optionIndex) => optionIndex >= 0);
    if (!enabled.length) return;
    const step = event.key === "ArrowLeft" ? -1 : 1;
    const position = enabled.indexOf(index);
    const next = event.key === "Home" ? enabled[0] : event.key === "End" ? enabled.at(-1)! : enabled[(position + step + enabled.length) % enabled.length];
    buttons.current[next]?.focus();
    onChange(options[next].value);
  }

  return <div className={`${s.root} ${s.segmented}`} role="tablist" aria-label={label} aria-orientation="horizontal" style={{ "--n": Math.max(1, options.length), "--k": Math.max(0, active) } as SignalStyle}>
    {active >= 0 && <span className={s.segmentIndicator} aria-hidden="true" />}
    {options.map((option, index) => <button type="button" role="tab" id={option.id ?? `${id}-${index}`} key={option.value} aria-selected={index === active} aria-controls={option.panelId} disabled={option.disabled} tabIndex={index === active ? 0 : -1} ref={(element) => { buttons.current[index] = element; }} onClick={() => onChange(option.value)} onKeyDown={(event) => handleKey(event, index)}>{option.label}</button>)}
  </div>;
}
