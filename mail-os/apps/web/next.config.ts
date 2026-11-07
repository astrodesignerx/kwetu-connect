import type { NextConfig } from "next";

/**
 * Browser-only hosting.
 *
 * Next proxies /api/* and /hubs/* to the ASP.NET backend, so the
 * browser talks same-origin and nothing needs CORS.
 */
const apiUrl = process.env.API_URL ?? "http://localhost:5280";

const nextConfig: NextConfig = {
  transpilePackages: ["@kompanion/types", "@kompanion/api-client"],

  async rewrites() {
    return [
      { source: "/api/:path*", destination: `${apiUrl}/api/:path*` },
      // SignalR mail hub. Without this the browser's /hubs/mail request hits
      // Next's 404 handler and live updates silently stop working. Next's
      // rewrite proxy does not forward the WebSocket upgrade, so the client
      // negotiates down to Server-Sent Events, see `useMailHub` in
      // src/lib/signalr.ts, which sets the transport explicitly rather than
      // paying for a failed WebSocket attempt on every connect.
      { source: "/hubs/:path*", destination: `${apiUrl}/hubs/:path*` },
    ];
  },
};

export default nextConfig;
