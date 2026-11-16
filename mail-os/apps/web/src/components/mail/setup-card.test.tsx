import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { SetupCard } from "./setup-card";
import { setFirstDayFlag } from "./first-day-state";
import { act } from "react";

const setup = { mailboxConnected: false, firstMailboxEmail: null, teamInvited: false, emailLookSaved: false, quickReplySaved: false };
beforeEach(() => { localStorage.clear(); vi.stubGlobal("matchMedia", () => ({ matches: true })); });
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });
it("puts the only gold action on the first unfinished step and announces done states", () => {
  const { container } = render(<SetupCard userId="admin" setup={{ ...setup, mailboxConnected: true, firstMailboxEmail: "sales@test.local" }} memberCount={1} />);
  expect(container.querySelectorAll(".btn-primary")).toHaveLength(1);
  expect(container.querySelector(".btn-primary")?.textContent).toBe("Invite");
  expect(screen.getByText("sales@test.local is connected")).toBeTruthy();
  expect(screen.getByText("1 of 4 done")).toBeTruthy();
  expect(screen.getByRole("list").tagName).toBe("OL");
  expect(screen.getAllByText(", Done")).toHaveLength(1);
});
it("hides per user, stays hidden after remount and returns from Finish setup", async () => {
  const first = render(<SetupCard userId="admin" setup={setup} memberCount={1} />);
  fireEvent.click(screen.getByRole("button", { name: "Hide setup" }));
  await waitFor(() => expect(screen.queryByText("Set up Kwetu OS")).toBeNull());
  first.unmount();
  const second = render(<SetupCard userId="admin" setup={setup} memberCount={1} />);
  expect(screen.queryByText("Set up Kwetu OS")).toBeNull();
  act(() => setFirstDayFlag("admin", "setup-hidden", false));
  expect(screen.getByText("Set up Kwetu OS")).toBeTruthy();
  second.unmount();
  render(<SetupCard userId="another-admin" setup={setup} memberCount={1} />);
  expect(screen.getByText("Set up Kwetu OS")).toBeTruthy();
});
it("finishes once and cuts immediately under reduced motion", async () => {
  const complete = { ...setup, mailboxConnected: true, teamInvited: true, emailLookSaved: true, quickReplySaved: true };
  const first = render(<SetupCard userId="admin" setup={complete} memberCount={3} />);
  expect(screen.getByText("Setup finished")).toBeTruthy();
  await waitFor(() => expect(screen.queryByText("Setup finished")).toBeNull());
  first.unmount();
  render(<SetupCard userId="admin" setup={complete} memberCount={3} />);
  expect(screen.queryByText("Setup finished")).toBeNull();
});
