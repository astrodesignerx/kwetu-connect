import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { CommandPalette, filterCommands, type Command } from "./command-palette";

const mail = vi.fn();
const clients = vi.fn();
const compose = vi.fn();
const onSearch = vi.fn();
const dialogMethods = {
  showModal: Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, "showModal"),
  close: Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, "close"),
};
const commands: Command[] = [
  { id: "mail", label: "Mail", group: "Routes", run: mail },
  { id: "clients", label: "Clients", group: "Routes", run: clients },
  { id: "compose", label: "New message", group: "Actions", keywords: "compose write", run: compose },
];

function Harness() {
  const [open, setOpen] = useState(false);
  return <>
    <button onClick={() => setOpen(true)}>Open commands</button>
    <CommandPalette open={open} onClose={() => setOpen(false)} commands={commands} onSearch={onSearch} />
  </>;
}

function openPalette() {
  render(<Harness />);
  const trigger = screen.getByRole("button", { name: "Open commands" });
  trigger.focus(); fireEvent.click(trigger);
  return { trigger, input: screen.getByRole("combobox") };
}

beforeEach(() => {
  vi.clearAllMocks();
  // jsdom does not implement native modal focus behaviour. The production code
  // uses showModal for browser focus trapping; these stubs expose its open state.
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
    configurable: true, value: vi.fn(function (this: HTMLDialogElement) { this.open = true; }),
  });
  Object.defineProperty(HTMLDialogElement.prototype, "close", {
    configurable: true, value: vi.fn(function (this: HTMLDialogElement) { this.open = false; }),
  });
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true })));
  vi.stubGlobal("requestAnimationFrame", vi.fn(() => 1));
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
});

afterEach(() => {
  cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals();
  for (const [method, descriptor] of Object.entries(dialogMethods)) {
    if (descriptor) Object.defineProperty(HTMLDialogElement.prototype, method, descriptor);
    else Reflect.deleteProperty(HTMLDialogElement.prototype, method);
  }
});

describe("Signal commands", () => {
  it("filters routes and action keywords without depending on case or whitespace", () => {
    expect(filterCommands(commands, "  CLIEnts  ").map((command) => command.id)).toEqual(["clients"]);
    expect(filterCommands(commands, "actions WRITE").map((command) => command.id)).toEqual(["compose"]);
    expect(filterCommands(commands, "no such command")).toEqual([]);
    expect(filterCommands(commands, "")).toHaveLength(3);
  });

  it("filters the visible list and executes the matching route with Enter", () => {
    const { input } = openPalette();
    fireEvent.change(input, { target: { value: "clients" } });
    const list = screen.getByRole("listbox");
    expect(within(list).queryByRole("option", { name: /^Mail/ })).toBeNull();
    expect(within(list).getByRole("option", { name: /^Clients/ }).getAttribute("aria-selected")).toBe("true");
    fireEvent.keyDown(input, { key: "Enter" });
    expect(clients).toHaveBeenCalledOnce();
    expect(mail).not.toHaveBeenCalled();
    expect(compose).not.toHaveBeenCalled();
  });

  it("moves with arrow keys, wraps backwards and executes the selected action", () => {
    const { input } = openPalette();
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(screen.getByRole("option", { name: /^Clients/ }).getAttribute("aria-selected")).toBe("true");
    fireEvent.keyDown(input, { key: "ArrowUp" });
    fireEvent.keyDown(input, { key: "ArrowUp" });
    expect(screen.getByRole("option", { name: /^New message/ }).getAttribute("aria-selected")).toBe("true");
    fireEvent.keyDown(input, { key: "Enter" });
    expect(compose).toHaveBeenCalledOnce();
  });

  it("hands an unmatched query to mail search on Enter", () => {
    const { input } = openPalette();
    fireEvent.change(input, { target: { value: "  October artwork  " } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onSearch).toHaveBeenCalledWith("October artwork");
  });

  it("closes on Escape and returns focus without executing a command", async () => {
    const { input, trigger } = openPalette();
    expect(document.activeElement).toBe(input);
    fireEvent.keyDown(input, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(document.activeElement).toBe(trigger);
    expect(mail).not.toHaveBeenCalled();
    expect(clients).not.toHaveBeenCalled();
    expect(compose).not.toHaveBeenCalled();
  });
});
