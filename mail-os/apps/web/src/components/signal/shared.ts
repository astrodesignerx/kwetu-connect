import type { CSSProperties } from "react";

export type SignalStyle = CSSProperties & { [key: `--${string}`]: string | number };

// Only the LED specimens in the development gallery take a colour; the app itself is black and white.
export function hueStyle(colour = "#f2f2f2"): SignalStyle {
  return { "--h": colour };
}
