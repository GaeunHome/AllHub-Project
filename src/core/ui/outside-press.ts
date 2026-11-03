import { useEffect, type RefObject } from "react";

// 鈴鐺面板 人像選單 ⋮ 選單與 i 說明框共用 Esc 與收起後焦點去哪裡各自處理

/**
 * 開著時按在外框外面就收起 外框要包住按鈕與面板 按按鈕本身不算外面
 * focus 是 true 時焦點移到外面也算 用 Tab 離開也會收起
 */
export function useOutsidePress(open: boolean, rootRef: RefObject<HTMLElement | null>, onOutside: () => void, focus = false): void {
  useEffect(() => {
    if (!open) return;
    const handle = (event: Event) => {
      if (!rootRef.current?.contains(event.target as Node)) onOutside();
    };
    document.addEventListener("pointerdown", handle);
    if (focus) document.addEventListener("focusin", handle);
    return () => {
      document.removeEventListener("pointerdown", handle);
      if (focus) document.removeEventListener("focusin", handle);
    };
  }, [open, rootRef, onOutside, focus]);
}
