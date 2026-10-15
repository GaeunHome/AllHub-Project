// 彈出層開著時頁面自己的快捷鍵要讓開
// 用語意屬性判斷 模組不必知道 core 的 class 名稱

/**
 * 觸發按鈕標上這個屬性並配 aria-expanded
 * 面板不是 aria-haspopup 能宣告的角色時也認得出它開著 例如 ⋮ 選單的 group
 */
export const POPUP_TRIGGER = "data-popup-trigger";

/** 先用選擇器縮小範圍 細節交給 isOpenPopup */
const CANDIDATES = 'dialog[open], [aria-expanded="true"]';

type PopupCandidate = {
  tagName: string;
  hasAttribute(name: string): boolean;
  getAttribute(name: string): string | null;
  getClientRects(): { length: number };
};

type PopupRoot = { querySelectorAll(selectors: string): Iterable<PopupCandidate> };

const declaresPopup = (value: string | null) => value !== null && value !== "false";

/**
 * 開著的 dialog 或宣告了彈出層而且展開中的按鈕
 * 只是展開下方區塊的按鈕不算
 */
export function isOpenPopup(element: PopupCandidate): boolean {
  const open =
    element.tagName === "DIALOG"
      ? element.hasAttribute("open")
      : element.getAttribute("aria-expanded") === "true" && (declaresPopup(element.getAttribute("aria-haspopup")) || element.hasAttribute(POPUP_TRIGGER));
  // Activity 藏起來的頁面還留在文件裡 裡面展開著的按鈕不能擋住現在這一頁
  return open && element.getClientRects().length > 0;
}

export function popupLayerOpen(root: PopupRoot = document): boolean {
  for (const element of root.querySelectorAll(CANDIDATES)) if (isOpenPopup(element)) return true;
  return false;
}

type KeyTarget = {
  addEventListener(type: "keydown", listener: (event: Event) => void, capture?: boolean): void;
  removeEventListener(type: "keydown", listener: (event: Event) => void, capture?: boolean): void;
};

/**
 * 頁面自己的快捷鍵 按下的當下有彈出層開著就不交給 onKey
 * Esc 只關掉彈出層 回傳移除監聽的函式
 */
export function listenPageKeys(onKey: (event: KeyboardEvent) => void, { win = window, doc = document }: { win?: KeyTarget; doc?: KeyTarget & PopupRoot } = {}): () => void {
  let popupOpen = false;
  // 在 window 的捕獲階段先記下 選單自己的 Esc 監聽可能先跑把選單收掉
  // 冒泡到 document 時已經看不出來
  const remember = () => {
    popupOpen = popupLayerOpen(doc);
  };
  const handle = (event: Event) => {
    if (!popupOpen) onKey(event as KeyboardEvent);
  };
  win.addEventListener("keydown", remember, true);
  doc.addEventListener("keydown", handle);
  return () => {
    win.removeEventListener("keydown", remember, true);
    doc.removeEventListener("keydown", handle);
  };
}
