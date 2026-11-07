/**
 * Deterministic avatar initials and tints.
 *
 * Colour is derived from the address so the same correspondent always looks the same
 * — the point is recognition while scanning, not decoration. Hues are sampled around
 * the brand amber rather than across the full wheel, so a list of avatars still reads
 * as one palette instead of a fruit salad, and saturation stays low enough that the
 * amber used for unread and selection is still the loudest thing on screen.
 */

const HUES = [38, 96, 158, 208, 268, 320];

function hash(value: string): number {
  let h = 0;
  for (let i = 0; i < value.length; i++) {
    h = (h << 5) - h + value.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

export function tintFor(seed: string): string {
  if (!seed) return "hsl(38 55% 72%)";
  const hue = HUES[hash(seed.toLowerCase()) % HUES.length];
  return `hsl(${hue} 48% 72%)`;
}

/**
 * One or two letters from a display name, falling back to the address local part.
 * "Jane Wanjiru" -> JW, "creatives@kwetu.co.ke" -> CR.
 */
export function initialsFor(nameOrAddress: string): string {
  const raw = (nameOrAddress ?? "").trim();
  if (!raw) return "?";

  const local = raw.includes("@") ? raw.split("@")[0] : raw;
  const words = local.split(/[\s._-]+/).filter(Boolean);

  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}
