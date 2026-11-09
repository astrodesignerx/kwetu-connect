import { requireStaff } from "@/lib/auth/server";
import { getStore } from "@/lib/store";
import SettingsEditor from "@/components/manage/SettingsEditor";
export default async function SettingsPage() {
  await requireStaff();
  const store = getStore();
  const [settings, bookings] = await Promise.all([store.getSettings(), store.listBookings()]);
  // Saved bookings store their own price, so a rule change never touches them.
  const active = bookings.filter((booking) => booking.status !== "Cancelled" && booking.status !== "Finished").length;
  return <section className="settings-page"><SettingsEditor initial={settings} activeBookings={active} /></section>;
}
