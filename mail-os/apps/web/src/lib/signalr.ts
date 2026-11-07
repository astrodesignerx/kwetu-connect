"use client";

import * as signalR from "@microsoft/signalr";
import { createContext, createElement, useContext, useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "./auth-store";
import {
  terminalAttemptsExhausted,
  terminalBackoffDelay,
} from "./signalr-backoff";

export type HubStatus = "idle" | "connecting" | "connected" | "reconnecting" | "failed";

export interface PresenceState {
  [userId: string]: { online: boolean };
}

interface MailHubValue {
  status: HubStatus;
  presence: PresenceState;
}

const MailHubContext = createContext<MailHubValue>({ status: "idle", presence: {} });

/** Delays between automatic (transport-level) reconnect attempts. */
const AUTO_RETRY_DELAYS = [0, 1000, 2000, 5000, 10000, 30000];

/**
 * Owns the single SignalR connection for the whole app.
 *
 * There used to be three separate `HubConnectionBuilder` calls (one in this file,
 * two via `usePresence`), which meant three sockets per user and three sets of
 * presence events. One connection multiplexes every event; consumers read the
 * results out of context.
 *
 * The token goes through `accessTokenFactory` rather than a hand-built query
 * string, so reconnects always carry the current session. When the connection
 * dies terminally (or never starts), a bounded backoff restarts it instead of
 * leaving live updates off; timers are cancelled on sign-out and unmount, and the
 * effect owns exactly one connection at a time.
 *
 * Transport note: the hub is reached directly at NEXT_PUBLIC_HUB_URL (the API origin),
 * not through the Next dev proxy. That proxy neither forwards the WebSocket upgrade nor
 * streams the Server-Sent Events body unbuffered — the connection establishes, no
 * keepalive ping ever arrives, and the client drops it after 30 seconds with "server
 * timeout elapsed". Direct means real WebSockets, at the cost of a CORS policy on the
 * API. With the variable unset it still falls back to the proxy path on SSE, which is
 * better than nothing but will time out; see apps/web/.env.development.
 */
export function MailHubProvider({ children }: { children: React.ReactNode }) {
  const token = useAuthStore((s) => s.token);
  // useQueryClient returns the provider's single instance, so this is referentially
  // stable and safe to depend on — it won't churn the connection.
  const queryClient = useQueryClient();

  // Null until a connection callback reports something. The two states that are pure
  // functions of `token` — no token means idle, token-but-nothing-reported-yet means
  // connecting — are derived below rather than written from inside the effect, which
  // would cause a cascading render on every sign-in.
  const [reported, setReported] = useState<HubStatus | null>(null);
  const [presence, setPresence] = useState<PresenceState>({});

  const status: HubStatus = !token ? "idle" : (reported ?? "connecting");

  useEffect(() => {
    if (!token) return;

    let cancelled = false;
    let connection: signalR.HubConnection | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let terminalFailures = 0;

    const clearTimer = () => {
      if (retryTimer !== null) {
        clearTimeout(retryTimer);
        retryTimer = null;
      }
    };

    function invalidateMail() {
      void queryClient.invalidateQueries({ queryKey: ["threads"] });
      void queryClient.invalidateQueries({ queryKey: ["thread"] });
      void queryClient.invalidateQueries({ queryKey: ["thread-counts"] });
      void queryClient.invalidateQueries({ queryKey: ["overview"] });
    }

    async function refreshPresence(conn: signalR.HubConnection) {
      try {
        const online = await conn.invoke<Array<{ userId: string }>>("GetPresence");
        if (cancelled) return;
        setPresence(Object.fromEntries(online.map((u) => [u.userId, { online: true }])));
      } catch {
        // Deltas keep arriving over the socket; a missed snapshot is not fatal.
      }
    }

    function scheduleRestart() {
      if (cancelled || retryTimer !== null) return;
      if (terminalAttemptsExhausted(terminalFailures)) {
        setReported("failed");
        return;
      }
      const delay = terminalBackoffDelay(terminalFailures);
      terminalFailures += 1;
      setReported("reconnecting");
      retryTimer = setTimeout(() => {
        retryTimer = null;
        void start();
      }, delay);
    }

    function build(): signalR.HubConnection {
      const directUrl = process.env.NEXT_PUBLIC_HUB_URL;
      const url = `${directUrl ?? ""}/hubs/mail`;

      const conn = new signalR.HubConnectionBuilder()
        .withUrl(url, {
          accessTokenFactory: () => useAuthStore.getState().token ?? "",
          ...(directUrl ? {} : { transport: signalR.HttpTransportType.ServerSentEvents }),
        })
        .withAutomaticReconnect(AUTO_RETRY_DELAYS)
        .build();

      conn.on("threadsChanged", () => {
        invalidateMail();
      });

      conn.on("mailboxSyncState", () => {
        void queryClient.invalidateQueries({ queryKey: ["overview"] });
        void queryClient.invalidateQueries({ queryKey: ["thread-counts"] });
      });

      // Phase 7 collaboration events. These were broadcast by the server but nothing
      // on the client ever subscribed, so assignments and notes made by a teammate
      // only showed up after a manual refresh.
      conn.on("threadAssigned", (p: { threadId: string }) => {
        void queryClient.invalidateQueries({ queryKey: ["thread-assignment", p.threadId] });
        void queryClient.invalidateQueries({ queryKey: ["threads"] });
      });

      conn.on("threadNotesChanged", (p: { threadId: string }) => {
        void queryClient.invalidateQueries({ queryKey: ["thread-notes", p.threadId] });
      });

      conn.on("presenceChanged", (p: { userId: string; online: boolean }) => {
        setPresence((s) => ({ ...s, [p.userId]: { online: p.online } }));
      });

      conn.onreconnecting(() => {
        if (!cancelled) setReported("reconnecting");
      });
      conn.onreconnected(() => {
        if (cancelled) return;
        terminalFailures = 0;
        setReported("connected");
        invalidateMail();
        void refreshPresence(conn);
      });
      // Automatic reconnect exhausted: restart with bounded backoff instead of
      // going dark.
      conn.onclose(() => {
        if (cancelled) return;
        connection = null;
        scheduleRestart();
      });

      return conn;
    }

    async function start() {
      if (cancelled) return;
      if (connection) {
        try {
          await connection.stop();
        } catch {
          // A half-open socket may refuse to stop; rebuilding replaces it anyway.
        }
        connection = null;
      }
      const conn = build();
      connection = conn;
      try {
        await conn.start();
      } catch (err) {
        if (cancelled) return;
        connection = null;
        console.error("SignalR connection failed, retrying with backoff", err);
        scheduleRestart();
        return;
      }
      if (cancelled) {
        void conn.stop().catch(() => {});
        return;
      }
      terminalFailures = 0;
      setReported("connected");
      invalidateMail();
      await refreshPresence(conn);
    }

    void start();

    return () => {
      cancelled = true;
      clearTimer();
      const conn = connection;
      connection = null;
      if (conn) void conn.stop().catch(() => {});
      // Reset for the next session so a new sign-in doesn't inherit the previous
      // user's status or online list.
      setReported(null);
      setPresence({});
    };
  }, [token, queryClient]);

  const value = useMemo(() => ({ status, presence }), [status, presence]);
  return createElement(MailHubContext.Provider, { value }, children);
}

/** Live-connection status, for the "live / reconnecting / offline" indicator. */
export function useMailHubStatus(): HubStatus {
  return useContext(MailHubContext).status;
}

/** Online-state map for the org, keyed by user id. */
export function usePresence(): PresenceState {
  return useContext(MailHubContext).presence;
}
