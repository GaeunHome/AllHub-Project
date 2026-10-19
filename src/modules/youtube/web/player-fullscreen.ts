/** native 是瀏覽器的 Fullscreen API pseudo 是用 CSS 蓋滿視窗的頁內全螢幕 */
export type FullscreenMode = "off" | "native" | "pseudo";

export type FullscreenAction = "enter-native" | "enter-pseudo" | "exit-native" | "exit-pseudo";

/** 真的全螢幕以瀏覽器為準 按 Esc 離開時只有 fullscreenchange 知道 頁內全螢幕自己記 */
export function fullscreenMode({ native, pseudo }: { native: boolean; pseudo: boolean }): FullscreenMode {
  if (native) return "native";
  return pseudo ? "pseudo" : "off";
}

/** iPhone Safari 不能讓一般元素全螢幕 改用頁內全螢幕 字幕一樣疊在影片上 */
export function fullscreenToggle(mode: FullscreenMode, nativeAvailable: boolean): FullscreenAction {
  if (mode === "native") return "exit-native";
  if (mode === "pseudo") return "exit-pseudo";
  return nativeAvailable ? "enter-native" : "enter-pseudo";
}

/**
 * 頁內全螢幕時 html 不捲動 不用 :has 比對播放器
 * Activity 藏起來的頁面還留在文件裡 會連它一起算
 */
const PAGE_SCROLL_LOCK = "data-player-fullscreen";

type ScrollRoot = { setAttribute(name: string, value: string): void; removeAttribute(name: string): void };

/** 回傳解除的函式 放在 layout effect 的清除函式裡 收起 卸載或頁面被藏起來時立刻解除 */
export function lockPageScroll(root: ScrollRoot): () => void {
  root.setAttribute(PAGE_SCROLL_LOCK, "");
  return () => root.removeAttribute(PAGE_SCROLL_LOCK);
}

type FullscreenDocument = { fullscreenElement: Element | null; exitFullscreen(): Promise<void> };

/** 卸載或被 Activity 藏起來時 例如按上一頁 這個播放器還在全螢幕就離開 別的元素不動 */
export function leaveFullscreen(doc: FullscreenDocument, frame: Element | null): void {
  if (frame !== null && doc.fullscreenElement === frame) doc.exitFullscreen().catch(() => {});
}
