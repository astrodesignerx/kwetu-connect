import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/mail/actions", () => ({}));
vi.mock("@/app/mail/kca-actions", () => ({}));
vi.mock("@/app/manage/auth-actions", () => ({ signOut: vi.fn() }));
import MailDesk from "./MailDesk";

const accounts = [{ id: "a", label: "sales@example.test", email: "sales@example.test" }];

describe("Folder views", () => {
  it.each([["Sent", "Sent mail"], ["Spam", "If it is genuine, use Move to inbox."], ["Bin", "use Move to inbox to restore it"]] as const)("shows a placeholder in %s instead of the Morning brief", (view, text) => {
    const html = renderToStaticMarkup(<MailDesk initialAccounts={accounts} initialQuery="" initialView={view} />);
    expect(html).toContain("reader-idle");
    expect(html).toContain(text);
    expect(html).not.toContain("Morning brief</h2>");
  });

  it("keeps the Morning brief in the Inbox", () => {
    const html = renderToStaticMarkup(<MailDesk initialAccounts={accounts} initialQuery="" />);
    expect(html).not.toContain("reader-idle");
  });
});
