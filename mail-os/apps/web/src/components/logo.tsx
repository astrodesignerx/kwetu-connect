// The Kwetu Connect mark, drawn as one flat colour that follows the text colour.
export function Logo({ size = 32 }: { size?: number }) {
  return <span className="signal-logo" style={{ width: size, height: size }} aria-hidden="true">
    <span className="kca-mark" style={{ width: Math.round(size * 0.65), height: Math.round(size * 0.78) }} />
  </span>;
}
