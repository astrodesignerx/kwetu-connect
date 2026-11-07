import { createApiClient } from "@kompanion/api-client";
import { useAuthStore } from "./auth-store";

/**
 * Where the API lives.
 *
 * Served by Next, this is empty: the dev server proxies /api/* to the backend, so the
 * browser stays same-origin. NEXT_PUBLIC_API_URL may hold an absolute API origin for
 * deployments where the web app and the API live on different hosts.
 */
const baseUrl = process.env.NEXT_PUBLIC_API_URL ?? "";

export const api = createApiClient({
  baseUrl,
  getToken: () => useAuthStore.getState().token,
  onUnauthorized: () => handleUnauthorized(),
});

/**
 * Centralized dead-session handling for every API request, upload and download.
 * Clears the session and returns to login. Never fires for anonymous calls, so an
 * ordinary wrong-password login error stays on the login form instead of looping.
 * The full navigation drops in-memory user-scoped query state with the page.
 */
export function handleUnauthorized() {
  const { token, logout } = useAuthStore.getState();
  if (!token) return;
  logout();
  if (typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
    // Full navigation, not client routing: it drops in-memory user-scoped query
    // state along with the page. Module scope has no router; this is intentional.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign("/login");
  }
}
