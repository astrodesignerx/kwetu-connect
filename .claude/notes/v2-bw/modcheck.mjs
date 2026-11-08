// Checks that every CSS module class referenced from TSX exists, and lists module classes nothing references.
// Usage: node modcheck.mjs <path to mail-os/apps/web>
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(process.argv[2]);
const files = [];
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.tsx?$/.test(e.name)) files.push(p);
  }
})(path.join(root, "src"));

const byCss = new Map();
let bad = 0;
for (const f of files) {
  const src = fs.readFileSync(f, "utf8");
  for (const m of src.matchAll(/import\s+(\w+)\s+from\s+["']([^"']+\.module\.css)["']/g)) {
    const [, name, rel] = m;
    const cssPath = rel.startsWith("@/") ? path.join(root, "src", rel.slice(2)) : path.resolve(path.dirname(f), rel);
    const css = fs.readFileSync(cssPath, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/url\([^)]*\)/g, "");
    const defined = new Set([...css.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)].map((x) => x[1]));
    const used = new Set([...src.matchAll(new RegExp("\\b" + name + "\\.(\\w+)", "g"))].map((x) => x[1]));
    for (const m2 of src.matchAll(new RegExp("\\b" + name + "\\[[\"'`]([\\w-]+)[\"'`]\\]", "g"))) used.add(m2[1]);
    const missing = [...used].filter((u) => !defined.has(u));
    if (missing.length) {
      bad++;
      console.log("MISSING", path.relative(root, f), missing.join(" "));
    }
    const entry = byCss.get(cssPath) || { defined, used: new Set(), dyn: false, srcs: "" };
    used.forEach((u) => entry.used.add(u));
    if (src.includes(name + "[")) entry.dyn = true;
    entry.srcs += src;
    byCss.set(cssPath, entry);
  }
}
for (const [css, e] of byCss) {
  // A class is counted as used if it is referenced as s.name, or appears as a quoted string (dynamic access).
  const unused = [...e.defined].filter((d) => !e.used.has(d) && !(e.dyn && new RegExp("[\"'`]" + d + "[\"'`]").test(e.srcs)));
  if (unused.length) console.log("unused", path.relative(root, css), unused.join(" "));
}
process.exit(bad ? 1 : 0);
