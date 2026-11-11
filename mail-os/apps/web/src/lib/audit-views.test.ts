import { describe, expect, it } from "vitest";
import { isPageView } from "./signal-settings";

describe("isPageView", () => {
  it("hides admin screens that were only opened", () => {
    for (const action of ["admin.workspace.overview", "admin.audit.daily.view", "admin.users.view", "admin.mailboxes.view"]) expect(isPageView(action)).toBe(true);
  });
  it("never hides changes or an admin reading mail", () => {
    for (const action of ["admin.thread.view", "admin.mailbox.threads.view", "admin.invitation.create", "brandkit.update", "mail.thread.state"]) expect(isPageView(action)).toBe(false);
  });
});
