export function typingIn(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  return !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || !!el.closest?.('[contenteditable="true"], [role="textbox"]'));
}
export function shortcut(event: Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey" | "altKey" | "target">) {
  // A chord cannot be typed by accident, so Ctrl K opens search from a field too, as in other mail apps.
  if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === "k") return "search";
  if (typingIn(event.target)) return null;
  if (event.ctrlKey || event.metaKey || event.altKey) return null;
  return ({ j: "next", k: "previous", e: "archive", d: "done", s: "star", u: "unread", r: "reply", a: "replyAll", f: "forward", i: "inspector", z: "undo", "/": "search", "?": "help", Escape: "escape" } as Record<string, string>)[event.key === "Escape" ? event.key : event.key.toLowerCase()] ?? null;
}
export const SHORTCUTS = [["J / K", "Next / previous conversation"], ["E", "Archive"], ["D", "Mark done"], ["S", "Star"], ["U", "Mark unread"], ["R / A / F", "Reply / reply all / forward"], ["I", "Inspector"], ["Z", "Undo"], ["/ / Ctrl K", "Search"], ["Escape", "Close menu, dock or conversation"], ["Ctrl Enter", "Send from the reply dock"], ["?", "Keyboard shortcuts"]];
