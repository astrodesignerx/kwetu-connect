"use client";

import { useMailHubStatus, usePresence, type PresenceState } from "@/lib/signalr";

// Presence and live-connection state both come from the single hub connection
// owned by MailHubProvider. Re-exported here so existing imports keep working.
export { usePresence };
export type { PresenceState };

export function PresencePill({
  state,
  myUserId,
}: {
  state: PresenceState;
  myUserId?: string;
}) {
  const onlineIds = Object.keys(state).filter(
    (id) => state[id]?.online && id !== myUserId
  );
  if (onlineIds.length === 0) return null;
  return (
    <div className="flex items-center gap-1 text-xs text-muted">
      <span className="status-dot" data-state="healthy" aria-hidden="true" />
      <span>{onlineIds.length} online</span>
    </div>
  );
}

/**
 * Surfaces the live-update connection state. Previously a failed hub connection
 * only produced a console warning, so the app looked healthy while silently
 * serving stale mail : this makes the degraded state visible.
 */
export function LiveStatusPill() {
  const status = useMailHubStatus();
  if (status === "connected" || status === "idle") return null;

  const label =
    status === "failed"
      ? "Live updates offline"
      : status === "reconnecting"
        ? "Reconnecting…"
        : "Connecting…";

  return (
    <div
      title={
        status === "failed"
          ? "Not receiving live mail updates. Refresh to fetch the latest, or check that the API is running."
          : undefined
      }
      className="flex items-center gap-1 text-xs text-muted"
    >
      <span className="status-dot" data-state={status === "failed" ? "failed" : "waiting"} aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}
