import { listAccounts, saveAccount, addMember } from "./accounts";
import { demoAccountFields, demoList, mailDemoEnabled } from "./demo";
import { assignThread, setDone } from "./kca-data";
import { loadAccount } from "./accounts";
import { messageIdentity } from "./status";

export async function seedDemoMailboxes(me: string) {
  if (!mailDemoEnabled()) return;
  const shared = globalThis as typeof globalThis & { kcaMailStaff?: Map<string, string>; kcaMailSharingSeeded?: boolean };
  if (shared.kcaMailSharingSeeded) return;
  shared.kcaMailStaff = new Map([[me, "Demo staff"], ["rose@kca.local", "Rose Chebet"]]);
  const own = await saveAccount(me, demoAccountFields("team@kwetuconnectads.co.ke"));
  const other = await saveAccount("rose@kca.local", demoAccountFields("studio@kwetuconnectads.co.ke"));
  await addMember(me, own.id, "rose@kca.local");
  await addMember("rose@kca.local", other.id, me);
  const account = await loadAccount(me, own.id), rows = demoList(account, "INBOX", {}, 0, 100).items;
  const assigned = rows.find((r) => r.from.address === "DAVID@example.com");
  if (assigned) await assignThread(me, own.id, assigned.subject, "rose@kca.local");
  const done = rows.find((r) => r.subject === "Weekly screen report: 99.2% on air");
  if (done) await setDone(me, own.id, done.subject, messageIdentity(done));
  const secondAccount = await loadAccount(me, other.id), secondRow = demoList(secondAccount, "INBOX", {}, 0, 100).items.find((r) => r.from.address === "agnes@example.com");
  if (secondRow) await assignThread(me, other.id, secondRow.subject, me);
  // Keep existing sample connections from the core phase when refreshing the development process.
  await listAccounts(me);
  shared.kcaMailSharingSeeded = true;
}
