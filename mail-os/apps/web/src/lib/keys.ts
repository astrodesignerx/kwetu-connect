/**
 * The modifier label for shortcut hints.
 *
 * The composer's send hint read "⌘↵" everywhere, including in the Windows desktop
 * build, where that key does not exist. Resolved lazily on the client — evaluating it
 * during server rendering would bake one platform's answer into the HTML.
 */
export function modKeyLabel(): string {
  if (typeof navigator === "undefined") return "Ctrl";
  return /mac|iphone|ipad/i.test(navigator.userAgent) ? "⌘" : "Ctrl";
}
