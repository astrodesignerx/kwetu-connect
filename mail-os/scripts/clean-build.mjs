import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rootReal = await fs.realpath(root).catch(() => root);

const allowlist = [
  "apps/web/.next",
  ".turbo",
  "apps/web/.turbo",
  "apps/api/bin",
  "apps/api/obj",
  "apps/api.tests/bin",
  "apps/api.tests/obj",
  "tools/MailSpike/bin",
  "tools/MailSpike/obj",
];

let removed = 0;
for (const rel of allowlist) {
  const target = path.resolve(root, rel);
  if (target === root || !target.startsWith(root + path.sep)) {
    console.log(`skip (outside workspace): ${rel}`);
    continue;
  }
  let linkedAncestor = false;
  let ancestor = root;
  for (const segment of rel.split("/").slice(0, -1)) {
    ancestor = path.join(ancestor, segment);
    try {
      if ((await fs.lstat(ancestor)).isSymbolicLink()) {
        linkedAncestor = true;
        break;
      }
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      break;
    }
  }
  if (linkedAncestor) {
    console.log(`skip (linked ancestor): ${rel}`);
    continue;
  }
  let stat;
  try {
    stat = await fs.lstat(target);
  } catch {
    console.log(`skip (absent): ${rel}`);
    continue;
  }
  if (stat.isSymbolicLink()) {
    await fs.unlink(target);
    console.log(`removed link: ${rel}`);
    removed += 1;
    continue;
  }
  if (!stat.isDirectory()) {
    console.log(`skip (not a directory): ${rel}`);
    continue;
  }
  const targetReal = await fs.realpath(target).catch(() => null);
  if (targetReal === null) {
    console.log(`skip (absent): ${rel}`);
    continue;
  }
  if (targetReal !== rootReal && !targetReal.startsWith(rootReal + path.sep)) {
    console.log(`skip (outside workspace): ${rel}`);
    continue;
  }
  await fs.rm(target, { recursive: true, force: true });
  console.log(`removed: ${rel}`);
  removed += 1;
}
console.log(`clean:build removed ${removed} targets`);
