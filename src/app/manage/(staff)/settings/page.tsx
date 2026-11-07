import { requireStaff } from "@/lib/auth/server";
import { getStore } from "@/lib/store";
import SettingsEditor from "@/components/manage/SettingsEditor";
export default async function SettingsPage() {
  await requireStaff();
  return <section className="settings-page"><div className="pipeline-heading"><div><h1>Settings</h1><p className="settings-intro">How the screen is sold. Existing quotes keep their price.</p></div></div><SettingsEditor initial={await getStore().getSettings()} /></section>;
}
