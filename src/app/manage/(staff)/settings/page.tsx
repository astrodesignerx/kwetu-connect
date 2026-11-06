import { requireStaff } from "@/lib/auth/server";
import { getStore } from "@/lib/store";
import SettingsEditor from "@/components/manage/SettingsEditor";
export default async function SettingsPage() {
  await requireStaff();
  return <section className="settings-page"><p className="settings-intro">How the screen is sold. New quotes use these settings; quotes already made keep their price.</p><SettingsEditor initial={await getStore().getSettings()} /></section>;
}
