export type PlayerShortcut = "fullscreen" | "theater" | "exit";

export type ShortcutEvent = Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey" | "altKey" | "repeat" | "isComposing" | "defaultPrevented"> & {
  target: EventTarget | null;
};

/** 這些 input 不能打字，焦點在上面時快捷鍵照樣有效 */
const NON_TEXT_INPUTS = new Set(["checkbox", "radio", "button", "submit", "reset", "range", "color", "file", "image"]);

function isTyping(target: EventTarget | null): boolean {
  const element = target as { tagName?: string; type?: string; isContentEditable?: boolean } | null;
  if (!element?.tagName) return false;
  if (element.isContentEditable) return true;
  if (element.tagName === "TEXTAREA" || element.tagName === "SELECT") return true;
  return element.tagName === "INPUT" && !NON_TEXT_INPUTS.has((element.type ?? "text").toLowerCase());
}

/** 照 YouTube 的快捷鍵：f 全螢幕、t 劇院模式；焦點在 YouTube 的 iframe 裡時按鍵到不了這個頁面，由 YouTube 自己處理 */
export function playerShortcut(event: ShortcutEvent): PlayerShortcut | null {
  if (event.defaultPrevented || event.repeat || event.isComposing || event.ctrlKey || event.metaKey || event.altKey) return null;
  if (isTyping(event.target)) return null;
  const key = event.key.toLowerCase();
  if (key === "f") return "fullscreen";
  if (key === "t") return "theater";
  if (key === "escape") return "exit";
  return null;
}
