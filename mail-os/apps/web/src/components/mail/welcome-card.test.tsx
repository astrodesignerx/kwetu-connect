import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { mailboxWords, WelcomeCard } from "./welcome-card";

beforeEach(() => { localStorage.clear(); vi.stubGlobal("matchMedia", () => ({ matches: true })); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it("lists the real mailboxes and verified keys, then dismisses and stays dismissed", async () => {
  const focus = vi.fn();
  const props = { userId: "brian", displayName: "Brian Otieno", mailboxes: [{ email: "sales@test.local" }, { email: "info@test.local" }], onOpen: focus };
  const first = render(<WelcomeCard {...props} />);
  expect(screen.getByText("Welcome, Brian")).toBeTruthy();
  expect(screen.getByText("sales@test.local and info@test.local")).toBeTruthy();
  expect([...first.container.querySelectorAll("kbd")].map(key => key.textContent)).toEqual(["J", "K", "R", "E"]);
  expect(first.container.querySelectorAll(".btn-primary")).toHaveLength(1);
  fireEvent.click(screen.getByRole("button", { name: "Open the inbox" }));
  await waitFor(() => expect(focus).toHaveBeenCalledOnce());
  expect(screen.queryByText("Welcome, Brian")).toBeNull();
  first.unmount();
  render(<WelcomeCard {...props} />);
  expect(screen.queryByText("Welcome, Brian")).toBeNull();
});
it("uses commas and and up to three addresses, then two and a count", () => {
  expect(mailboxWords(["a", "b", "c"])).toBe("a, b and c");
  expect(mailboxWords(["a", "b", "c", "d"])).toBe("a, b and 2 more");
});
it("does not greet a person without a mailbox", () => {
  const { container } = render(<WelcomeCard userId="member" displayName="Brian" mailboxes={[]} onOpen={vi.fn()} />);
  expect(container.innerHTML).toBe("");
});
