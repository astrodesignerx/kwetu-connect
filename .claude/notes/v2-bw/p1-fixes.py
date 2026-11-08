# Phase 1 follow-up: drop unused hue helpers and the display font, put icons on 14/16/18. Run from mail-os/apps/web/src.
import os, re

def sub(path, pairs):
    s = open(path, encoding='utf-8').read()
    for a, b in pairs:
        if a not in s:
            raise SystemExit(f"miss in {path}: {a[:70]}")
        s = s.replace(a, b)
    open(path, 'w', encoding='utf-8', newline='\n').write(s)

sub('lib/signal-clients.ts', [('''export const CLIENT_HUES = ["#A285F4", "#3CC8C0", "#FBB040", "#8DCB5E"] as const;

export function clientColour(id: string): string {
  let hash = 0;
  for (const char of id.toLowerCase()) hash = (Math.imul(hash, 31) + char.charCodeAt(0)) >>> 0;
  return CLIENT_HUES[hash % CLIENT_HUES.length];
}

''', '')])
s = open('lib/signal-mail.ts', encoding='utf-8').read()
s2 = re.sub(r'export function clientColour\(id\?: string \| null\) \{.*?\n\}\n\n?', '', s, flags=re.S)
assert s2 != s
open('lib/signal-mail.ts', 'w', encoding='utf-8', newline='\n').write(s2)
sub('components/clients/client-data.test.ts', [
    ('import { CLIENT_HUES, clientColour, validateFlight } from "@/lib/signal-clients";', 'import { validateFlight } from "@/lib/signal-clients";'),
    ('''describe("client colour", () => {
  it("is stable across casing and uses only the four contract hues", () => {
    const id = "A285F400-1234-4567-8901-1234567890AB";
    expect(clientColour(id)).toBe(clientColour(id.toLowerCase()));
    expect(CLIENT_HUES).toContain(clientColour(id));
    expect(new Set(Array.from({ length: 16 }, (_, i) => clientColour(`client-${i}`)))).toEqual(new Set(CLIENT_HUES));
  });
});

''', '')])
sub('app/layout.tsx', [
    ('import { Bricolage_Grotesque, Geist, Geist_Mono, DotGothic16 } from "next/font/google";', 'import { Geist, Geist_Mono } from "next/font/google";'),
    ('const display = Bricolage_Grotesque({ subsets: ["latin"], variable: "--f-display", display: "swap" });\n', ''),
    ('const led = DotGothic16({ weight: "400", subsets: ["latin"], variable: "--f-led", display: "swap" });\n', ''),
    ('className={`${display.variable} ${body.variable} ${mono.variable} ${led.variable}`}', 'className={`${body.variable} ${mono.variable}`}')])
g = open('app/globals.css', encoding='utf-8').read()
g = g.replace('left: 50%; top: -3px; width: 1px; height: 12px;', 'left: 50%; top: -2px; width: 1px; height: 12px;')
open('app/globals.css', 'w', encoding='utf-8', newline='\n').write(g)

MAP = {10: 14, 11: 14, 12: 14, 13: 14, 15: 16, 17: 16, 19: 18, 20: 18, 22: 18, 24: 18}
def icon(m):
    if re.match(r'<(Logo|ClientAvatar|Avatar|Button)\b', m.group(1)):
        return m.group(0)
    return m.group(1) + str(MAP.get(int(m.group(2)), int(m.group(2)))) + m.group(3)
for root, _, files in os.walk('.'):
    if root.replace(os.sep, '/').startswith('./app/dev'):
        continue
    for n in files:
        if not n.endswith('.tsx') or '.test.' in n:
            continue
        p = os.path.join(root, n)
        t = open(p, encoding='utf-8').read()
        o = t
        # inline <Icon size={N}> and multi-line props: a size prop that sits within an icon element
        t = re.sub(r'(<[A-Z]\w*\b[^<>]*?\bsize=\{)(\d+)(\})', icon, t)
        t = re.sub(r'(\bsize=\{compact \? )(\d+)( : )(\d+)(\})', lambda m: f"{m.group(1)}{MAP.get(int(m.group(2)), int(m.group(2)))}{m.group(3)}{MAP.get(int(m.group(4)), int(m.group(4)))}{m.group(5)}", t)
        t = re.sub(r' strokeWidth=\{[\d.]+\}', '', t)
        t = t.replace(' mt-0.5', ' mt-1').replace(' pt-0.5"', ' pt-1"').replace('"space-y-0.5 ', '"space-y-1 ')
        if t != o:
            open(p, 'w', encoding='utf-8', newline='\n').write(t)
            print(p)
