// Source audit for the Kwetu OS black and white system.
// Usage (from the repository root): node .claude/notes/v2-bw/audit.mjs
// Scans mail-os/apps/web/src, excluding src/app/dev and tests. Exits 1 on any finding.
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const repo = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "../../..");
const web = path.join(repo, "mail-os/apps/web");
const src = path.join(web, "src");

const SIZES = new Set([12, 13, 14, 16, 20, 28]);
const WEIGHTS = new Set([400, 500, 600]);
const ICONS = new Set([14, 16, 18]);
const RADII = /^(0|var\(--radius-(tag|control|card|panel)\)|50%|999px|inherit|0 0 var\(--radius-card\) var\(--radius-card\))$/;
const TW_RADII = new Set(["rounded-tag", "rounded-control", "rounded-card", "rounded-panel", "rounded-full", "rounded-none"]);

// Spacing values that are allowed off the 4 px grid, each with its reason. Keys are "file:selector-or-class".
const SPACING_ALLOW = [
  [/^-?(1|2)px$/, "hairline or a 2 px step inside a small control (keycaps, chips, merge field chips, segmented control, switch track, focus offsets)"],
  [/^-1px$/, "pulls a veil over a 1 px border so hover fills reach the edge"],
  [/^7px 11px$/, "invalid field: the 2 px border takes 1 px from each side so the text does not move"],
  [/^3px$/, "the struck ring on a failed status dot is centred on an 8 px dot"],
];
const SPACING_PROPS = /^(margin|margin-(top|right|bottom|left|inline|block)(-start|-end)?|padding|padding-(top|right|bottom|left|inline|block)(-start|-end)?|gap|row-gap|column-gap|height|min-height|max-height|inset|top|right|bottom|left)$/;

// Places where colour is allowed: rendered email, user-chosen brand colours, outgoing email HTML, the dev gallery.
const COLOUR_EXCEPTIONS = [
  /src[\\/]lib[\\/](mail-frame|brand-preview|sanitize-html|merge-fields|send-identity|compose-context)\.ts$/,
  /src[\\/]app[\\/]settings[\\/]brand-kit[\\/]/,
  /src[\\/]components[\\/]signal[\\/](boards|shared)\.tsx?$/,
];

const findings = [];
const add = (file, line, rule, text) => findings.push({ file: path.relative(repo, file).replace(/\\/g, "/"), line, rule, text: text.trim().slice(0, 140) });

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (full.includes(path.join("src", "app", "dev"))) continue;
      walk(full, out);
    } else if (/\.(css|tsx|ts)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) && !entry.name.endsWith(".d.ts")) out.push(full);
  }
  return out;
}

function neutral(hex) {
  let h = hex.slice(1);
  if (h.length === 3 || h.length === 4) h = h.slice(0, 3).split("").map((c) => c + c).join("");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  return Math.max(r, g, b) - Math.min(r, g, b) <= 2;
}

function reducedMotionRanges(text) {
  const ranges = [];
  const re = /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{/g;
  let m;
  while ((m = re.exec(text))) {
    let depth = 1, i = m.index + m[0].length;
    while (i < text.length && depth) { if (text[i] === "{") depth++; else if (text[i] === "}") depth--; i++; }
    ranges.push([m.index, i]);
  }
  return ranges;
}

function lineOf(text, index) { return text.slice(0, index).split("\n").length; }

function auditCss(file, text) {
  const clean = text.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, " "));
  const motion = reducedMotionRanges(clean);
  const colourOk = COLOUR_EXCEPTIONS.some((re) => re.test(file));
  for (const m of clean.matchAll(/([a-z-]+)\s*:\s*([^;{}]+)/g)) {
    const [, prop, value] = m;
    const at = lineOf(clean, m.index);
    if (prop === "font-size") for (const px of value.matchAll(/(\d+(?:\.\d+)?)px/g)) { if (!SIZES.has(Number(px[1]))) add(file, at, "font-size", m[0]); }
    if (prop === "font-size" && /rem|em\b/.test(value)) add(file, at, "font-size", m[0]);
    if (prop === "font-weight" && !WEIGHTS.has(Number(value.trim()))) add(file, at, "font-weight", m[0]);
    if (/^border(-(top|bottom)-(left|right))?-radius$/.test(prop) && !RADII.test(value.trim())) add(file, at, "radius", m[0]);
    if (prop === "letter-spacing" && /-/.test(value)) add(file, at, "negative tracking", m[0]);
    if (prop === "text-transform" && /uppercase/.test(value)) add(file, at, "uppercase", m[0]);
    if (prop === "box-shadow" && !/^(none|var\(--shadow-(menu|dialog)\)|inset 0 0 0 1px var\(--line\)|0 0 0 1000px var\(--raise\) inset)$/.test(value.trim())) add(file, at, "shadow", m[0]);
    if (SPACING_PROPS.test(prop)) {
      const parts = value.replace(/calc\([^)]*\)|max\([^)]*\)|min\([^)]*\)|var\([^)]*\)|env\([^)]*\)/g, "").trim();
      const pxs = [...parts.matchAll(/(-?\d+(?:\.\d+)?)px/g)].map((x) => Number(x[1]));
      if (pxs.some((n) => n % 4 !== 0) && !SPACING_ALLOW.some(([re]) => re.test(parts) || pxs.every((n) => n % 4 === 0 || re.test(`${n}px`)))) add(file, at, "spacing", m[0]);
    }
    if (!colourOk) {
      for (const hex of value.matchAll(/#[0-9a-fA-F]{3,8}\b/g)) if (!neutral(hex[0])) add(file, at, "colour", m[0]);
      for (const rgb of value.matchAll(/rgba?\(\s*(\d+)[ ,]+(\d+)[ ,]+(\d+)/g)) { const v = rgb.slice(1, 4).map(Number); if (Math.max(...v) - Math.min(...v) > 2) add(file, at, "colour", m[0]); }
      if (/\b(red|green|blue|orange|amber|purple|violet|yellow|teal|pink)\b/.test(value) && !/url\(/.test(value)) add(file, at, "colour", m[0]);
    }
  }
  for (const m of clean.matchAll(/!important/g)) if (!motion.some(([a, b]) => m.index >= a && m.index <= b)) add(file, lineOf(clean, m.index), "!important", clean.split("\n")[lineOf(clean, m.index) - 1]);
  for (const m of clean.matchAll(/--f-display/g)) add(file, lineOf(clean, m.index), "display font", "--f-display");
  for (const m of clean.matchAll(/var\(--(sodium|sodium-ink|on-sodium|jac|good|warn|bad|glow|mail-waiting|mail-shadow)\b/g)) add(file, lineOf(clean, m.index), "dead colour alias", m[0]);
}

const TW_COLOUR = /(?:^|[\s"'`:])!?(?:text|bg|border|ring|fill|stroke|outline|from|to|via|decoration|accent|caret|divide|placeholder|shadow)-(?:red|green|blue|amber|orange|yellow|violet|purple|pink|teal|emerald|sky|indigo|rose|lime|cyan|fuchsia|slate|gray|zinc|neutral|stone|white|black|brand)\b/;

function auditTsx(file, text) {
  const lines = text.split("\n");
  const colourOk = COLOUR_EXCEPTIONS.some((re) => re.test(file));
  lines.forEach((line, i) => {
    const at = i + 1;
    for (const m of line.matchAll(/(?:^|[\s"'`:])!?text-\[(\d+(?:\.\d+)?)px\]/g)) if (!SIZES.has(Number(m[1]))) add(file, at, "font-size", m[0]);
    for (const m of line.matchAll(/text-\[[\d.]+r?em\]/g)) add(file, at, "font-size", m[0]);
    for (const m of line.matchAll(/fontSize:\s*["']?(\d+)/g)) if (!SIZES.has(Number(m[1]))) add(file, at, "font-size", m[0]);
    for (const m of line.matchAll(/(?:^|[\s"'`:])(font-(?:thin|extralight|light|bold|extrabold|black|\[\d+\]))(?=[\s"'`])/g)) add(file, at, "font-weight", m[1]);
    for (const m of line.matchAll(/(?:^|[\s"'`:])(rounded(?:-[a-z0-9[\]().%-]+)?)(?=[\s"'`])/g)) if (!TW_RADII.has(m[1])) add(file, at, "radius", m[1]);
    for (const m of line.matchAll(/(?:^|[\s"'`:])(tracking-[a-z0-9[\].-]+|uppercase)(?=[\s"'`])/g)) add(file, at, m[1].startsWith("upper") ? "uppercase" : "tracking", m[1]);
    for (const m of line.matchAll(/(?:^|[\s"'`:])((?:-?(?:m|p)[xytrbl]?|gap(?:-[xy])?|space-[xy]|h|w|min-h|max-h|inset|top|left|right|bottom)-(\d+\.\d+))(?=[\s"'`])/g)) if (Number(m[2]) !== 0.5 || !/py-0\.5|px-0\.5/.test(m[1])) add(file, at, "spacing", m[1]);
    for (const m of line.matchAll(/(?:^|[\s"'`])!(?:p[xytrbl]?|m[xytrbl]?|text|bg|inline|flex|gap|w|h)-/g)) add(file, at, "!important", m[0]);
    for (const m of line.matchAll(/\[&_[^\]]+\]/g)) add(file, at, "reach-in selector", m[0]);
    for (const m of line.matchAll(/<([A-Z]\w+)\b[^>]*?\bsize=\{(\d+)\}/g)) if (/^[A-Z]/.test(m[1]) && !ICONS.has(Number(m[2])) && !/Logo|Avatar/.test(m[1])) add(file, at, "icon size", m[0].slice(0, 60));
    if (/--f-display/.test(line)) add(file, at, "display font", "--f-display");
    if (/var\(--(sodium|sodium-ink|on-sodium|jac|good|warn|bad|glow|mail-waiting|mail-shadow)\b/.test(line)) add(file, at, "dead colour alias", line);
    if (!colourOk) {
      if (TW_COLOUR.test(line)) add(file, at, "colour utility", line.match(TW_COLOUR)[0]);
      for (const hex of line.matchAll(/["'`(\s:]#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})\b/g)) if (!neutral("#" + hex[1])) add(file, at, "colour", line);
    }
  });
}

for (const file of walk(src)) {
  const text = fs.readFileSync(file, "utf8");
  if (file.endsWith(".css")) auditCss(file, text);
  else auditTsx(file, text);
}

// Typography characters banned in changed lines (code, comments, copy) since the base commit.
const BASE = process.env.AUDIT_BASE || "d3a6221";
const diff = execSync(`git diff ${BASE} -U0 -- mail-os/apps/web .claude/notes/v2-bw`, { cwd: repo, encoding: "utf8", maxBuffer: 64 << 20 });
let current = "";
let lineNo = 0;
for (const raw of diff.split("\n")) {
  if (raw.startsWith("+++ ")) { current = raw.slice(6); continue; }
  const hunk = raw.match(/^@@ -\d+(?:,\d+)? \+(\d+)/);
  if (hunk) { lineNo = Number(hunk[1]); continue; }
  if (raw.startsWith("+") && !raw.startsWith("+++")) {
    if (/[—–·•]/.test(raw) && !current.endsWith("audit.mjs")) findings.push({ file: current, line: lineNo, rule: "dash or dot character", text: raw.slice(1, 140) });
    lineNo++;
  }
}

const byRule = findings.reduce((acc, f) => ((acc[f.rule] = (acc[f.rule] || 0) + 1), acc), {});
for (const f of findings) console.log(`${f.file}:${f.line}  [${f.rule}]  ${f.text}`);
console.log(`\n${findings.length} findings`, JSON.stringify(byRule));
process.exit(findings.length ? 1 : 0);
