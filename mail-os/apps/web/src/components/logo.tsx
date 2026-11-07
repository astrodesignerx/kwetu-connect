export function KMark({ size = 24, ...props }: { size?: number } & React.SVGProps<SVGSVGElement>) {
  return <svg width={size} height={size} viewBox="0 0 120 144" aria-hidden="true" {...props}>
    <image href="/brand/kca-icon.svg" width="120" height="144" />
  </svg>;
}

export function Logo({ size = 32 }: { size?: number }) {
  return <span className="signal-logo" style={{ width: size, height: size }} aria-hidden="true"><KMark size={Math.round(size * 0.78)} /></span>;
}
