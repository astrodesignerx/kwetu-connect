/**
 * Helpers for the frame a message is shown in.
 *
 * Height: a frame is sized to its content. Some emails say "min-height: 100vh", and inside a frame 100vh is the
 * frame's own height, so every measure made it taller and the message scrolled forever with nothing to read.
 * The frame is shrunk to 1px while it is measured, so only real content counts, and the frame never scrolls itself.
 *
 * Links use the reader palette and are underlined. Long addresses are clipped, with the full address in a tooltip.
 */

/** The iframe uses the Mail surface behind it. MessageFrame copies the active colour scheme into the document. */
export const FRAME_CSS = `
html {
	color-scheme: light dark;
	--ss-link: light-dark(#1a56db, #a3c9f2);
	--ss-quote-text: light-dark(#7a695d, #bdc5cf);
	height: auto !important;
	min-height: 0 !important;
	overflow-y: hidden !important;
	overflow-x: auto;
}
body {
	margin: 0;
	padding: 2px 0;
	font: 14.5px/1.62 "Archivo", -apple-system, "Segoe UI", Roboto, sans-serif;
	color: light-dark(#1D160D, #FAF2E9);
	background: transparent;
	height: auto !important;
	min-height: 0 !important;
	overflow-wrap: anywhere;
}
img { max-width: 100%; height: auto; }
.ss-pic {
	display: inline-block;
	max-width: 100%;
	padding: 3px 10px;
	border: 1px dashed light-dark(#d9c7b4, #4c535c);
	border-radius: 8px;
	color: var(--ss-quote-text);
	font-size: 12px;
	line-height: 1.6;
}
pre { white-space: pre-wrap; font: inherit; }
table { max-width: 100%; }
blockquote {
	margin: 8px 0;
	padding-left: 12px;
	border-left: 3px solid light-dark(#e9c9a8, #68717b);
	color: var(--ss-quote-text);
}
details.ss-quoted { margin-top: 12px; }
details.ss-quoted > summary {
	display: inline-flex;
	align-items: center;
	cursor: pointer;
	list-style: none;
	padding: 3px 11px;
	border-radius: 999px;
	background: light-dark(#f2e9de, #34383f);
	color: var(--ss-quote-text);
	font-size: 12px;
	user-select: none;
}
details.ss-quoted > summary::-webkit-details-marker { display: none; }
details.ss-quoted > summary:hover { background: light-dark(#eadccb, #41464e); }
details.ss-quoted[open] > summary { margin-bottom: 8px; }
a { color: var(--ss-link); text-decoration: underline; text-underline-offset: 2px; }
a.ss-clip {
	display: inline-block;
	max-width: 100%;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
	vertical-align: bottom;
}`;

const transparent = (c: string) => c === "transparent" || /rgba\(\s*\d+,\s*\d+,\s*\d+,\s*0\s*\)/.test(c);

/** Apply the reader's link colour except to coloured buttons, and clip long plain-text links. */
export function polishLinks(d: Document) {
	const win = d.defaultView;
	if (!win) return;
	for (const a of Array.from(d.querySelectorAll<HTMLAnchorElement>("a[href]"))) {
		if (a.dataset.ssDone) continue;
		a.dataset.ssDone = "1";
		const hasMedia = !!a.querySelector("img, table, svg");
		const cs = win.getComputedStyle(a);
		let coloured = !transparent(cs.backgroundColor) || cs.backgroundImage !== "none";
		// A button is often a coloured table cell that holds nothing but the link.
		const mine = (a.textContent ?? "").trim();
		for (let p: HTMLElement | null = a.parentElement, i = 0; p && i < 3 && !coloured; p = p.parentElement, i++) {
			if (p.tagName === "BODY" || (p.textContent ?? "").trim() !== mine) break;
			if (!transparent(win.getComputedStyle(p).backgroundColor)) coloured = true;
		}
		if (!hasMedia && !coloured) a.style.setProperty("color", "var(--ss-link)", "important");
		const text = (a.textContent ?? "").trim();
		if (!hasMedia && text.length > 48 && !/\s/.test(text.slice(0, 40))) {
			a.classList.add("ss-clip");
			if (!a.title) a.title = a.href;
		}
	}
}

/**
 * Size the frame to its content and keep it right as images load or the layout shifts.
 * Returns a cleanup. `set` receives the height in pixels.
 */
export function fitFrame(frame: HTMLIFrameElement, set: (h: number) => void, opts: { min?: number; max?: number } = {}): () => void {
	const d = frame.contentDocument;
	if (!d?.documentElement) return () => undefined;
	const min = opts.min ?? 40;
	const max = opts.max ?? 30000;
	let last = -1;
	let raf = 0;
	const run = () => {
		raf = 0;
		polishLinks(d);
		const prev = frame.style.height;
		frame.style.height = "1px";
		const h = Math.max(d.body?.scrollHeight ?? 0, d.documentElement.scrollHeight);
		frame.style.height = prev;
		const next = Math.min(max, Math.max(min, Math.ceil(h) + 2));
		if (Math.abs(next - last) > 1) { last = next; set(next); }
	};
	const schedule = () => { if (!raf) raf = requestAnimationFrame(run); };
	run();
	const ro = typeof ResizeObserver !== "undefined" && d.body ? new ResizeObserver(schedule) : null;
	ro?.observe(d.body);
	d.addEventListener("load", schedule, true);
	d.addEventListener("toggle", schedule, true);
	return () => { ro?.disconnect(); d.removeEventListener("load", schedule, true); d.removeEventListener("toggle", schedule, true); if (raf) cancelAnimationFrame(raf); };
}
