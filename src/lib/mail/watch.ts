import { accountsToWatch, recordSync } from "./accounts";
import { classify, explain, pathOf, withImap } from "./client";
import { cleanUploads } from "./drafts";

export async function watchMail(budgetMs = 45_000) {
  const deadline = Date.now() + budgetMs;
  let checked = 0;
  let errors = 0;
  const started = new Date().toISOString();
  let complete = true;
  await cleanUploads();
  while (Date.now() < deadline - 9_000) {
    const accounts = await accountsToWatch(started, 4);
    if (!accounts.length) return { checked, errors, complete };
    await Promise.all(accounts.map(async (a) => {
      try {
        const unread = await withImap(a, async (client) => {
          const inbox = pathOf(classify(await client.list()), "inbox") ?? "INBOX";
          const status = await client.status(inbox, { unseen: true });
          if (!status) throw new Error("Mailbox status unavailable");
          return status.unseen ?? 0;
        }, Math.min(8_000, deadline - Date.now() - 1000));
        await recordSync(a.id, unread, null);
      } catch (e) {
        errors++;
        await recordSync(a.id, null, explain(e));
      }
      checked++;
    }));
    if (accounts.length < 4) return { checked, errors, complete };
  }
  complete = false;
  return { checked, errors, complete };
}
