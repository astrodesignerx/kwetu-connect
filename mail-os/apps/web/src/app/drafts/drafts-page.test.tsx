import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { MailDraftDto } from "@kompanion/types";
import { useAuthStore } from "@/lib/auth-store";
import DraftsPage from "@/app/drafts/page";
import { DraftCount } from "@/components/shell/draft-count";

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/drafts",
}));

const { mailOverview, listDrafts } = vi.hoisted(() => ({
  mailOverview: vi.fn(),
  listDrafts: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  api: {
    mailOverview,
    listDrafts: (id: string) => listDrafts(id),
    deleteDraft: vi.fn().mockResolvedValue(undefined),
    upsertDraft: vi.fn(),
    sendMail: vi.fn(),
    uploadAttachment: vi.fn(),
    deleteStagedAttachment: vi.fn().mockResolvedValue(undefined),
    aiStatus: vi.fn().mockResolvedValue({ configured: false }),
    previewTemplate: vi.fn(),
    listTemplatePreviews: vi.fn().mockResolvedValue([]),
    getTemplate: vi.fn(),
  },
  handleUnauthorized: vi.fn(),
}));

function draft(id: string, mailbox: string, to: string | null, bcc: string | null): MailDraftDto {
  return {
    id,
    mailboxConnectionId: mailbox,
    replyToMessageId: null,
    replyToAddress: null,
    references: null,
    toAddrs: to,
    ccAddrs: null,
    bccAddrs: bcc,
    subject: `Subject ${id}`,
    bodyText: null,
    bodyHtml: "<p>preserved body</p>",
    hasAttachments: true,
    attachmentMetaJson: null,
    createdAt: "2026-10-01T00:00:00Z",
    updatedAt: "2026-10-02T00:00:00Z",
    replyToThreadId: null,
    skipBrandWrap: false,
    inReplyTo: null,
    attachments: [
      { id: `file-${id}`, fileName: "note.txt", contentType: "text/plain", sizeBytes: 4, isInline: false, contentId: null },
    ],
    lastSend: null,
    rowVersion: 1,
  };
}

function seedApi() {
  mailOverview.mockResolvedValue({
    mailboxes: [
      { id: "m1", email: "one@test.local" },
      { id: "m2", email: "two@test.local" },
    ],
  });
  listDrafts.mockImplementation((id: string) => {
    if (id === "m1") return Promise.resolve([draft("d1", "m1", "one@test.local", null)]);
    return Promise.resolve([draft("d2", "m2", "two@test.local", "hidden@test.local")]);
  });
}

function renderWithClient(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe("drafts across mailboxes", () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    // jsdom does not implement the deprecated editing APIs the rich text
    // editor reads for toolbar state.
    Object.defineProperty(document, "queryCommandState", {
      value: vi.fn().mockReturnValue(false),
      configurable: true,
    });
    Object.defineProperty(document, "execCommand", {
      value: vi.fn().mockReturnValue(false),
      configurable: true,
    });
    seedApi();
    useAuthStore.setState({
      token: "tok",
      hydrated: true,
      user: { id: "u", email: "a@t", username: "a", displayName: "A", role: "Member", createdAt: "" },
    });
  });

  it("renders two drafts from two mailboxes and opens the second with Bcc, body and attachment", async () => {
    renderWithClient(<DraftsPage />);

    expect(await screen.findByText(/Subject d1/)).toBeTruthy();
    expect(await screen.findByText(/Subject d2/)).toBeTruthy();

    const second = (await screen.findByText(/Subject d2/)).closest("li")!;
    fireEvent.click(second.querySelector("button")!);

    // The resumed compose sheet carries the second draft's own fields.
    expect(await screen.findByDisplayValue("two@test.local")).toBeTruthy();
    expect(await screen.findByDisplayValue("hidden@test.local")).toBeTruthy();
    expect(await screen.findByText("note.txt")).toBeTruthy();
  });

  it("counts drafts across every mailbox in the sidebar badge", async () => {
    renderWithClient(<DraftCount />);
    expect(await screen.findByLabelText("2 drafts")).toBeTruthy();
  });

  it("derives readiness from saved fields and the compose requirement for a To recipient", async () => {
    listDrafts.mockImplementation((id: string) => Promise.resolve(id === "m1" ? [
      draft("ready", "m1", "recipient@test.local", "private@test.local"),
      { ...draft("missing", "m1", null, null), subject: null },
      draft("bcc-only", "m1", null, "private@test.local"),
    ] : []));
    renderWithClient(<DraftsPage />);
    expect(await screen.findByText("Ready to send")).toBeTruthy();
    expect(await screen.findByText("Missing recipient and subject")).toBeTruthy();
    expect(screen.getByText("Missing recipient")).toBeTruthy();
    expect(screen.getByText("3 saved, 1 ready to send")).toBeTruthy();
  });
});
