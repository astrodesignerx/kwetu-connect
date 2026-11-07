import { requireStaff } from "@/lib/auth/server";
import { getStore } from "@/lib/store";
import { signOut } from "../auth-actions";
import ManagerSidebar from "@/components/manage/ManagerSidebar";
import { todayInNairobi } from "@/lib/store/validation";
import ManagerTopbar from "@/components/manage/ManagerTopbar";
import ScreenNow from "@/components/manage/ScreenNow";
import { hourShares } from "@/lib/dashboard";
export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const staff = await requireStaff();
  const store = getStore();
  const [bookings, settings] = await Promise.all([store.listBookings(), store.getSettings()]);
  const details = await Promise.all(bookings.filter((booking) => !["Finished", "Cancelled"].includes(booking.status)).map((booking) => store.bookingDetail(booking.reference)));
  const adverts = details.reduce((count, detail) => count + (detail?.adverts.filter((advert) => advert.decision === "waiting").length ?? 0), 0);
  const today = todayInNairobi();
  const now = new Date().toISOString();
  let schedule = null;
  let scheduleError = false;
  try { schedule = await store.schedule(today, today); } catch { scheduleError = true; }
  return <div className="manager-app"><ManagerSidebar adverts={adverts} email={staff.email} signOut={signOut}><ScreenNow schedule={schedule} businesses={Object.fromEntries(bookings.map((booking) => [booking.reference, booking.business]))} shares={hourShares(bookings, today, settings)} settings={settings} now={now} error={scheduleError} /></ManagerSidebar><div className="manager-main"><ManagerTopbar today={today} now={now} notices={adverts} /><div className="manager-content">{children}</div></div></div>;
}
