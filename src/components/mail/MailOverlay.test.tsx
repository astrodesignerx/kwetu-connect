// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { useConfirm } from "./MailOverlay";

let answers: boolean[] = [];
function Asker() {
  const [dialog, ask] = useConfirm();
  return <>{dialog}<button type="button" id="ask" onClick={async () => { answers.push(await ask({ title: "Delete this draft?", text: "Gone for good.", action: "Delete draft" })); }}>Ask</button></>;
}
async function mount() {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div");document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => root.render(<Asker />));
  return { host, root };
}
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 400)); });
afterEach(() => { answers = []; document.body.innerHTML = ""; vi.unstubAllGlobals(); });

it("answers no on Cancel, with Cancel focused first", async () => {
  const { host } = await mount();
  await act(async () => host.querySelector<HTMLButtonElement>("#ask")!.click());
  const dialog = host.querySelector("dialog")!;
  expect(dialog.getAttribute("role")).toBe("alertdialog");
  expect(dialog.textContent).toContain("Delete this draft?");
  expect(dialog.querySelector(".btn.line")?.hasAttribute("autofocus") || document.activeElement?.textContent === "Cancel").toBe(true);
  await act(async () => dialog.querySelector<HTMLButtonElement>(".btn.line")!.click());
  await settle();
  expect(answers).toEqual([false]);
  expect(host.querySelector("dialog")).toBeNull();
});

it("answers yes on the action button", async () => {
  const { host } = await mount();
  await act(async () => host.querySelector<HTMLButtonElement>("#ask")!.click());
  await act(async () => host.querySelector<HTMLButtonElement>(".btn.danger")!.click());
  await settle();
  expect(answers).toEqual([true]);
  expect(host.querySelector("dialog")).toBeNull();
});

it("hands Escape straight to the owner when the exit waits for it, as New email does", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const { MailModal } = await import("./MailOverlay");
  const host = document.createElement("div");document.body.appendChild(host);
  const root = createRoot(host), onClose = vi.fn();
  await act(async () => root.render(<MailModal label="Write an email" exitFirst={false} onClose={onClose}><form><input /></form></MailModal>));
  await act(async () => { host.querySelector("dialog")!.dispatchEvent(new Event("cancel", { cancelable: true })); });
  expect(onClose).toHaveBeenCalledTimes(1);
  expect(host.querySelector("dialog")!.classList.contains("is-leaving")).toBe(false);
  await act(async () => root.unmount());
});
