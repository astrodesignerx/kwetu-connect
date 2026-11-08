// Removes one-line CSS module rules whose every selector names a class that no TSX file references.
// Usage: node prune.mjs <path to mail-os/apps/web> [--write]
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(process.argv[2]);
const write = process.argv.includes("--write");
const files = [];
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.tsx?$/.test(e.name)) files.push(p);
  }
})(path.join(root, "src"));

const used = new Map();
for (const f of files) {
  const src = fs.readFileSync(f, "utf8");
  for (const m of src.matchAll(/import\s+(\w+)\s+from\s+["']([^"']+\.module\.css)["']/g)) {
    const [, name, rel] = m;
    const css = rel.startsWith("@/") ? path.join(root, "src", rel.slice(2)) : path.resolve(path.dirname(f), rel);
    const set = used.get(css) ?? new Set();
    for (const u of src.matchAll(new RegExp("\\b" + name + "\\.(\\w+)", "g"))) set.add(u[1]);
    // dynamic access such as s[name] or s["name"]: keep every quoted word that matches a class
    if (src.includes(name + "[")) for (const q of src.matchAll(/["'`]([A-Za-z][\w-]*)["'`]/g)) set.add(q[1]);
    used.set(css, set);
  }
}
for (const [css, set] of used) {
  if (css.includes(path.join("app", "dev"))) continue;
  const lines = fs.readFileSync(css, "utf8").split("\n");
  const keep = [];
  const removed = [];
  for (const line of lines) {
    const m = line.match(/^\s*([^{}@/][^{]*)\{[^{}]*\}\s*$/);
    if (m) {
      const selectors = m[1].split(",").map((x) => x.trim());
      const dead = selectors.map((sel) => [...sel.replace(/:global\([^)]*\)/g, "").matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)].some((c) => !set.has(c[1])));
      if (dead.every(Boolean)) { removed.push(line.trim().slice(0, 100)); continue; }
      if (dead.some(Boolean)) {
        const live = selectors.filter((_, i) => !dead[i]);
        const next = line.replace(m[1], live.join(", ") + " ");
        removed.push("(trimmed) " + selectors.filter((_, i) => dead[i]).join(", "));
        keep.push(next);
        continue;
      }
    }
    keep.push(line);
  }
  if (removed.length) {
    console.log(path.relative(root, css));
    for (const r of removed) console.log("  - " + r);
    if (write) fs.writeFileSync(css, keep.join("\n"));
  }
}
