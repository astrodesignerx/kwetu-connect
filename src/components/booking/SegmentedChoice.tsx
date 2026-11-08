"use client";
import type { CSSProperties } from "react";
// The highlight reads the row's real gap and padding (--seg-gap, --seg-pad in globals.css), so it always lines up with the picked button.
export default function SegmentedChoice({ options, value, onChange }: { options: { value: number; label: string; description?: string }[]; value: number; onChange: (value: number) => void }) {
  const selected = Math.max(0, options.findIndex((option) => option.value === value));
  return <div className="segmented has-sliding-highlight"><span className="segment-highlight" aria-hidden="true" style={{ "--count": options.length, "--index": selected } as CSSProperties} />{options.map((option) => <button key={option.value} type="button" aria-label={option.description} aria-pressed={value === option.value} onClick={() => onChange(option.value)}>{option.label}</button>)}</div>;
}
