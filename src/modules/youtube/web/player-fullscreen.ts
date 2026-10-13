/** off：一般；native：瀏覽器的全螢幕（Fullscreen API）；pseudo：頁內全螢幕（用 CSS 蓋滿整個視窗） */
export type FullscreenMode = "off" | "native" | "pseudo";

export type FullscreenAction = "enter-native" | "enter-pseudo" | "exit-native" | "exit-pseudo";

/** 真的全螢幕以瀏覽器的狀態為準（按 Esc 離開時只有 fullscreenchange 知道），頁內全螢幕是自己記的 */
export function fullscreenMode({ native, pseudo }: { native: boolean; pseudo: boolean }): FullscreenMode {
  if (native) return "native";
  return pseudo ? "pseudo" : "off";
}

/** iPhone Safari 不能讓一般元素全螢幕（document.fullscreenEnabled 是 false），改用頁內全螢幕，字幕一樣疊在影片上 */
export function fullscreenToggle(mode: FullscreenMode, nativeAvailable: boolean): FullscreenAction {
  if (mode === "native") return "exit-native";
  if (mode === "pseudo") return "exit-pseudo";
  return nativeAvailable ? "enter-native" : "enter-pseudo";
}

/** 頁內全螢幕時 html 不捲動（globals.css 的 html[data-player-fullscreen]）：Activity 藏起來的頁面還留在文件裡，用 :has 比對播放器會連它一起算 */
export const PAGE_SCROLL_LOCK = "data-player-fullscreen";

type ScrollRoot = { setAttribute(name: string, value: string): void; removeAttribute(name: string): void };

/** 回傳解除的函式：放在 layout effect 的清除函式裡，收起、卸載或頁面被藏起來的當下就解除 */
export function lockPageScroll(root: ScrollRoot): () => void {
  root.setAttribute(PAGE_SCROLL_LOCK, "");
  return () => root.removeAttribute(PAGE_SCROLL_LOCK);
}

type FullscreenDocument = { fullscreenElement: Element | null; exitFullscreen(): Promise<void> };

/** 卸載或頁面被 Activity 藏起來（例如按上一頁）時：這個播放器還在原生全螢幕就離開；別的元素在全螢幕不去動它 */
export function leaveFullscreen(doc: FullscreenDocument, frame: Element | null): void {
  if (frame !== null && doc.fullscreenElement === frame) doc.exitFullscreen().catch(() => {});
}
