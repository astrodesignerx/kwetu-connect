import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ComposeModal } from "./compose";

const { previewTemplate, upsertDraft } = vi.hoisted(() => ({
  previewTemplate: vi.fn().mockResolvedValue({ subject: "Campaign", bodyHtml: "<p>Designed message</p>" }),
  upsertDraft: vi.fn().mockResolvedValue({ id: "draft", rowVersion: 1 }),
}));

vi.mock("@/lib/api", () => ({ api: {
  previewTemplate, upsertDraft, aiStatus: vi.fn().mockResolvedValue({ configured: false }),
  sendMail: vi.fn(), deleteDraft: vi.fn(), suggestReply: vi.fn(), rewrite: vi.fn(),
} }));
vi.mock("@/components/editor", () => ({ RichTextEditor: () => <div data-editor="true" /> }));

afterEach(() => { cleanup(); vi.clearAllMocks(); localStorage.clear(); });

describe("compose recipient preview", () => {
  it.each([true, false])("preserves the resumed design's brand-wrap choice (%s)", async (skipBrandWrap) => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    render(<QueryClientProvider client={client}><ComposeModal ctx={{
      mode: "new", connectionId: "mailbox", draftId: "draft", skipBrandWrap,
      prefillSubject: "Campaign", prefillBody: "<p>Designed message</p>",
    }} onClose={() => {}} /></QueryClientProvider>);
    fireEvent.click(screen.getByRole("button", { name: "Show preview" }));
    await waitFor(() => expect(previewTemplate).toHaveBeenCalledWith(expect.objectContaining({
      bodyHtml: "<p>Designed message</p>", skipBrandWrap,
    })), { timeout: 2000 });
    client.clear();
  });
});
