// 導覽列下拉面板的狀態與鍵盤邏輯不依賴 React，才能在 node 環境直接測

/** 按下面板的按鈕：開著就收起；否則打開它並換掉原本開著的那個，同時只開一個 */
export function toggleMenu<T extends string>(open: T | null, id: T): T | null {
  return open === id ? null : id;
}

/** 面板只能收起自己：點外面的事件可能晚於另一個面板打開，不能把它關掉 */
export function closeMenu<T extends string>(open: T | null, id: T): T | null {
  return open === id ? null : open;
}

/** 選單裡按方向鍵、Home、End 要移到第幾項（到底繞回另一端）；current 為 -1 代表焦點還不在項目上，其他按鍵回傳 null */
export function menuFocusIndex(key: string, current: number, count: number): number | null {
  if (count === 0) return null;
  switch (key) {
    case "ArrowDown":
      return current < 0 ? 0 : (current + 1) % count;
    case "ArrowUp":
      return current < 0 ? count - 1 : (current - 1 + count) % count;
    case "Home":
      return 0;
    case "End":
      return count - 1;
    default:
      return null;
  }
}
