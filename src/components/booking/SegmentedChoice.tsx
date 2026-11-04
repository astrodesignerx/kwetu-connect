"use client";
export default function SegmentedChoice({ options, value, onChange }: { options: { value: number; label: string; description?: string }[]; value: number; onChange: (value: number) => void }) {
  const selected = Math.max(0, options.findIndex((option) => option.value === value));
  return <div className="segmented has-sliding-highlight"><span className="segment-highlight" aria-hidden="true" style={{ width: "calc((100% - " + (options.length - 1) * 5 + "px) / " + options.length + ")", transform: "translateX(calc(" + selected + " * (100% + 5px)))" }} />{options.map((option) => <button key={option.value} type="button" aria-label={option.description} aria-pressed={value === option.value} onClick={() => onChange(option.value)}>{option.label}</button>)}</div>;
}
