// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/manage/auth-actions", () => ({ signIn: vi.fn(), signInWithPassword: vi.fn() }));
import MailSignIn from "./MailSignIn";
import MailGate from "./MailGate";

afterEach(() => { document.body.innerHTML = ""; vi.unstubAllGlobals(); });

describe("Mail sign-in", () => {
  it("returns to /mail and explains an expired link", () => {
    const html = renderToStaticMarkup(<MailSignIn demo={false} linkError />);
    expect(html).toContain('name="next" value="/mail"');
    expect(html).toContain("That sign-in link has expired");
  });

  it("says plainly when it is demo mode", () => {
    expect(renderToStaticMarkup(<MailSignIn demo linkError={false} />)).toContain("Demo mode: any email and password opens the sample mailbox.");
  });

  it("switches between password, email link and password reset", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const host = document.createElement("div");document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => root.render(<MailSignIn demo={false} linkError={false} />));
    const press = (text: string) => act(async () => Array.from(host.querySelectorAll("button")).find((b) => b.textContent?.includes(text))!.click());
    await press("Email me a sign-in link");
    expect(host.querySelector('input[name="password"]')).toBeNull();
    expect(host.querySelector<HTMLInputElement>('input[name="mode"]')?.value).toBe("link");
    await press("Back to password sign-in");
    await press("Set or reset password");
    expect(host.querySelector<HTMLInputElement>('input[name="mode"]')?.value).toBe("reset");
    await act(async () => root.unmount());
  });

  it("hides the decorative conversation stream from assistive technology", () => {
    const html = renderToStaticMarkup(<MailGate title="T" text="X" points={[["inbox", "Point"]]}><p>Form</p></MailGate>);
    expect(html).toContain('class="gate-stream" aria-hidden="true"');
    expect(html).toContain("<h1>T</h1>");
  });
});
