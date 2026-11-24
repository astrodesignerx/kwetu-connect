import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";

// Next.js (RSC flight data) and this site's JSON-LD / feature-detect snippet are
// inlined, so script/style need 'unsafe-inline'. Everything else is locked to
// same-origin. The contact form posts to our own /api/contact route (covered by
// 'self'); the only third party is Google Maps (embedded iframe).
const contentSecurityPolicy = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "media-src 'self' blob:",
  "frame-src https://maps.google.com https://www.google.com",
  "frame-ancestors 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  "upgrade-insecure-requests",
].join("; ");

// The message frame blocks remote content until the reader asks to show pictures.
// The mail page allows https pictures so that explicit choice can load them.
const mailContentSecurityPolicy = contentSecurityPolicy
  .replace("img-src 'self' data: blob:", "img-src 'self' data: blob: https:")
  .replace("frame-src https:", "frame-src 'self' https:");

const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "X-DNS-Prefetch-Control", value: "on" },
  // Only emitted in production: the dev server relies on inline eval and an HMR
  // websocket that a strict CSP would block.
  ...(isProd ? [{ key: "Content-Security-Policy", value: contentSecurityPolicy }] : []),
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // The dev server would otherwise print every form action's arguments, mailbox passwords included.
  logging: { serverFunctions: false },
  turbopack: { root: __dirname },
  experimental: { serverActions: { bodySizeLimit: "55mb" } },
  async headers() {
    const mailHeaders = securityHeaders.map((h) => (h.key === "Content-Security-Policy" ? { ...h, value: mailContentSecurityPolicy } : h));
    return [
      {
        source: "/((?!mail(?:/|$)).*)",
        headers: securityHeaders,
      },
      {
        source: "/mail/:path*",
        headers: mailHeaders,
      },
    ];
  },
};

export default nextConfig;
