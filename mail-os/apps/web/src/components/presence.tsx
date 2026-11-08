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
    <div className="flex items-center gap-1 text-[10px] text-muted">
      <span className="inline-block h-1.5 w-1.5 rounded-full bg-muted" />
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
      className="flex items-center gap-1 text-[10px] text-muted"
    >
      <span
        className={
          "inline-block h-1.5 w-1.5 rounded-full transition-[transform,opacity] duration-200 " +
          (status === "failed" ? "bg-red-500" : "bg-fg animate-pulse")
        }
      />
      <span>{label}</span>
    </div>
  );
}
