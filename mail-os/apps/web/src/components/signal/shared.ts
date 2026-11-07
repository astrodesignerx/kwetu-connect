import type { CSSProperties } from "react";

export type SignalStyle = CSSProperties & { [key: `--${string}`]: string | number };

export const clientColour = "var(--jac, #6A48D8)";

export function hueStyle(colour = clientColour): SignalStyle {
  return { "--h": colour };
}
