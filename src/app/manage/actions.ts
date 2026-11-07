"use server";
import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth/server";
import { getStore } from "@/lib/store";
import type { BookingStatus } from "@/lib/booking/capacity";
import { StoreError, text } from "@/lib/store/validation";
import type { ActionState } from "@/components/manage/ActionForm";
import { sendBookingMail, siteOrigin } from "@/lib/booking-mail";

async function change(form: FormData, run: (reference: string, staff: { email: string }) => Promise<void>): Promise<ActionState> {
  const staff = await requireStaff();
  try {
    const reference = text(form.get("reference"), "a reference", 30);
    await run(reference, staff);
    revalidatePath("/manage", "layout"); revalidatePath(`/book/q/${reference}`);
    return { message: "Saved." };
  } catch (error) { return { message: error instanceof StoreError ? error.message : "Unable to save this change. Please try again." }; }
}
export async function paymentNote(_state: ActionState, form: FormData) {
  return change(form, async (ref) => getStore().savePaymentNote(ref, text(form.get("paymentNote"), "a payment note", 200)));
}
export async function moveBooking(_state: ActionState, form: FormData) {
  return change(form, async (ref, staff) => getStore().move(ref, String(form.get("to")) as BookingStatus, staff.email, text(form.get("note") ?? "", "a note", 500, true)));
}
export async function uploadAdvert(_state: ActionState, form: FormData) {
  return change(form, async (ref) => {
    const file = form.get("file");
    if (!(file instanceof File)) throw new StoreError("Choose an advert file.");
    await getStore().addAdvert(ref, file, Number(form.get("seconds")));
  });
}
export async function decideAdvert(_state: ActionState, form: FormData) {
  return change(form, async (ref) => {
    const store = getStore();
    const id = text(form.get("id"), "an advert ID", 40);
    const decision = String(form.get("decision")) as "approved" | "refused";
    await store.decideAdvert(ref, id, decision, String(form.get("reason") ?? ""));
    if (decision === "refused") {
      try {
        const detail = await store.bookingDetail(ref);
        if (detail?.advertiser.email) {
          const booking = await store.publicBooking(ref);
          const advert = detail.adverts.find((a) => a.id === id);
          if (booking && advert) await sendBookingMail("refused", detail.advertiser.email, detail.advertiser.name, [booking], await siteOrigin(), advert.reason);
        }
      } catch { console.error("Advert refusal email failed to send."); }
    }
  });
}
export async function saveSettings(_state: ActionState, form: FormData): Promise<ActionState> {
  await requireStaff();
  try {
    let settings;
    try { settings = JSON.parse(String(form.get("settings"))); } catch { throw new StoreError("Enter valid settings."); }
    await getStore().saveSettings(settings);
    revalidatePath("/book"); revalidatePath("/manage", "layout");
    return { message: "Settings saved. Existing quoted prices are kept." };
  } catch (error) { return { message: error instanceof StoreError ? error.message : "Unable to save settings. Please try again." }; }
}
