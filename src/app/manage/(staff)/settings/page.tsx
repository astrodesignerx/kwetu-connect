import { requireStaff } from "@/lib/auth/server";
import { getStore } from "@/lib/store";
import SettingsEditor from "@/components/manage/SettingsEditor";
export default async function SettingsPage() {
  await requireStaff();
  return <section className="space-y-6"><h1 className="text-2xl font-bold">Booking settings</h1><p>Settings apply to new quotes and current capacity and schedules. Bookings keep their quoted prices.</p><SettingsEditor initial={await getStore().getSettings()} /></section>;
}
