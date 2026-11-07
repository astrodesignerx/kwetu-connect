import { defineConfig } from "vitest/config";
import path from "path";

// Minimal interaction tests for the browser app: jsdom plus mocked network and
// SignalR transports. No dev servers, no real mailboxes.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}"],
    // Workspace packages are TS sources behind symlinks; transform them too.
    // SignalR must be processed (not externalized) so vi.mock can replace it.
    server: {
      deps: {
        inline: [/@kompanion/, /@microsoft\/signalr/],
      },
    },
  },
});
