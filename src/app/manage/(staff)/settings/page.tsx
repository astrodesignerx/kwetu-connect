import { requireStaff } from "@/lib/auth/server";
import { getStore } from "@/lib/store";
import SettingsEditor from "@/components/manage/SettingsEditor";
export default async function SettingsPage() {
  await requireStaff();
  return <section className="settings-page"><SettingsEditor initial={await getStore().getSettings()} /></section>;
}
