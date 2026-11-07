import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useAuthStore } from "./auth-store";
import { MailHubProvider, useMailHubStatus, usePresence } from "./signalr";

type Handler = (...args: never[]) => void;

interface FakeConnection {
  oncloseCb: Handler | null;
  started: boolean;
  stopped: boolean;
  invoked: string[];
  start: () => Promise<void>;
  stop: () => Promise<void>;
  invoke: (method: string) => Promise<unknown>;
  fireClose: () => void;
}

const { built, accessFactories, defaults } = vi.hoisted(() => ({
  built: [] as FakeConnection[],
  accessFactories: [] as Array<() => string>,
  defaults: {
    startBehavior: (() => Promise.resolve()) as () => Promise<void>,
  },
}));

function makeConnection(): FakeConnection {
  const conn: FakeConnection = {
    oncloseCb: null,
    started: false,
    stopped: false,
    invoked: [],
    start() {
      conn.started = true;
      return defaults.startBehavior();
    },
    stop() {
      conn.stopped = true;
      return Promise.resolve();
    },
    invoke(method: string) {
      conn.invoked.push(method);
      if (method === "GetPresence") return Promise.resolve([{ userId: "u2" }]);
      return Promise.resolve(undefined);
    },
    fireClose() {
      conn.oncloseCb?.();
    },
  };
  return conn;
}

vi.mock("@microsoft/signalr", () => ({
  HttpTransportType: { ServerSentEvents: 1 },
  HubConnectionBuilder: vi.fn().mockImplementation(function () {
    const conn = makeConnection();
    built.push(conn);
    return {
      withUrl: (_url: string, opts: { accessTokenFactory?: () => string }) => {
        if (opts?.accessTokenFactory) accessFactories.push(opts.accessTokenFactory);
        return {
          withAutomaticReconnect: () => ({
            build: () => ({
              on: () => {},
              onreconnecting: () => {},
              onreconnected: () => {},
              onclose: (cb: Handler) => {
                conn.oncloseCb = cb;
              },
              start: () => conn.start(),
              stop: () => conn.stop(),
              invoke: (method: string) => conn.invoke(method),
            }),
          }),
        };
      },
    };
  }),
}));

function Probe() {
  const status = useMailHubStatus();
  const presence = usePresence();
  const online = Object.entries(presence)
    .filter(([, v]) => v.online)
    .map(([k]) => k)
    .join(",");
  return (
    <div>
      <span data-testid="status">{status}</span>
      <span data-testid="online">{online}</span>
    </div>
  );
}

function renderHub() {
  const qc = new QueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <MailHubProvider>
        <Probe />
      </MailHubProvider>
    </QueryClientProvider>
  );
}

function statusOf() {
  return screen.getByTestId("status").textContent;
}

function onlineOf() {
  return screen.getByTestId("online").textContent;
}

describe("MailHubProvider lifecycle", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    built.length = 0;
    accessFactories.length = 0;
    defaults.startBehavior = () => Promise.resolve();
    useAuthStore.setState({
      token: "tok-1",
      user: {
        id: "u1",
        email: "a@test.local",
        username: "a",
        displayName: "A",
        role: "Member",
        createdAt: "",
      },
    });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    useAuthStore.setState({ token: null, user: null });
  });

  it("connects with the current token and loads the presence snapshot", async () => {
    renderHub();
    expect(built).toHaveLength(1);
    expect(accessFactories.at(-1)?.()).toBe("tok-1");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(statusOf()).toBe("connected");
    expect(built[0].invoked).toContain("GetPresence");
    expect(onlineOf()).toBe("u2");
  });

  it("restarts with backoff after the initial start fails", async () => {
    defaults.startBehavior = () => Promise.reject(new Error("down"));
    renderHub();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    // First terminal backoff is one second: no rebuild before it.
    expect(statusOf()).toBe("reconnecting");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(999);
    });
    expect(built).toHaveLength(1);

    defaults.startBehavior = () => Promise.resolve();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(built).toHaveLength(2);
    expect(statusOf()).toBe("connected");
  });

  it("restarts after a terminal close and stops cleanly on unmount", async () => {
    const tree = renderHub();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(statusOf()).toBe("connected");

    await act(async () => {
      built[0].fireClose();
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(built).toHaveLength(2);

    tree.unmount();
    expect(built[1].stopped).toBe(true);
    const builds = built.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60000);
    });
    expect(built).toHaveLength(builds);
  });
});
