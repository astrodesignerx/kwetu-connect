import { requireStaff } from "@/lib/auth/server";
import { getStore } from "@/lib/store";
import { signOut } from "../auth-actions";
import ManagerSidebar from "@/components/manage/ManagerSidebar";
import { todayInNairobi } from "@/lib/store/validation";
import ManagerTopbar from "@/components/manage/ManagerTopbar";
export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const staff = await requireStaff();
  const store = getStore();
  const [bookings, settings] = await Promise.all([store.listBookings(), store.getSettings()]);
  const details = await Promise.all(bookings.filter((booking) => !["Finished", "Cancelled"].includes(booking.status)).map((booking) => store.bookingDetail(booking.reference)));
  const adverts = details.reduce((count, detail) => count + (detail?.adverts.filter((advert) => advert.decision === "waiting").length ?? 0), 0);
  return <div className="manager-app"><ManagerSidebar adverts={adverts} email={staff.email} signOut={signOut} /><div className="manager-main"><ManagerTopbar today={todayInNairobi()} settings={settings} now={new Date().toISOString()} /><div className="manager-content">{children}</div></div></div>;
}
