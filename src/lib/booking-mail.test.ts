import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PublicBooking } from "./store/types";

const send = vi.hoisted(() => vi.fn());
vi.mock("resend", () => ({ Resend: class { emails = { send }; } }));
vi.mock("next/headers", () => ({ headers: vi.fn() }));
import { sendBookingMail } from "./booking-mail";

const booking: PublicBooking = {
  reference: "KCA-0123456789ABCDEF", status: "Paid", priceKes: 3200, fullPriceKes: 3200,
  discountPercent: 0, plays: 320, createdAt: "2026-10-27T10:00:00Z", adverts: 1,
  advertState: "refused", steps: [], capacity: { ok: true, fullHours: [], suggestions: [], largestHowOftenThatFits: null },
  request: { lengthSeconds: 10, howOften: 10, days: [6], blocks: ["morning"], startDate: "2026-11-02", endDate: "2026-11-29" },
};
beforeEach(() => { vi.clearAllMocks(); vi.stubEnv("RESEND_API_KEY", "test-key"); send.mockResolvedValue({ error: null }); });
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("refusal email", () => {
  it("escapes the reason and includes the booking button", async () => {
    await sendBookingMail("refused", "customer@example.test", "Amina", [booking], "https://example.test", 'Remove <script> & "small text".');
    const sent = send.mock.calls[0][0];
    expect(sent.subject).toBe("Your KCA advert needs changes");
    expect(sent.html).toContain("Remove &lt;script&gt; &amp; &quot;small text&quot;.");
    expect(sent.html).not.toContain("<script>");
    expect(sent.html).toContain(`href="https://example.test/book/q/${booking.reference}"`);
    expect(sent.html).toContain("Open your booking");
  });
  it("skips an absent email and swallows delivery failures", async () => {
    await sendBookingMail("refused", "", "Amina", [booking], "https://example.test", "Needs changes.");
    expect(send).not.toHaveBeenCalled();
    vi.spyOn(console, "error").mockImplementation(() => {});
    send.mockRejectedValue(new Error("Mail unavailable"));
    await expect(sendBookingMail("refused", "customer@example.test", "Amina", [booking], "https://example.test", "Needs changes.")).resolves.toBeUndefined();
  });
});
