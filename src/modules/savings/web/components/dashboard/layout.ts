// 內容與骨架共用 排得一樣串流進來時才不會跳
// 放在一般模組 伺服器元件才拿得到字串 從 use client 檔案匯入的只是參照

/** 一個大數字加上幾列合計 放得下時左右排 放不下時數字在上 */
export const BIG_FIGURE = "flex min-w-0 flex-wrap content-center items-center justify-between gap-x-8 gap-y-3";

/** 限寬 標籤與數字才不會隔得太遠 */
export const BIG_FIGURE_FACTS = "min-w-56 flex-1 sm:max-w-sm";

/**
 * 寬螢幕兩欄 左邊這個月要做的事 右邊本月收支與每月收支
 * 超寬螢幕右欄拆開 三張並排 每一欄各自是 page-stack 不從外框挑第幾個子元素
 */
export const OVERVIEW_COLUMNS = "grid gap-8 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] xl:items-start 2xl:grid-cols-3";

export const OVERVIEW_LEFT = "page-stack min-w-0";

export const OVERVIEW_RIGHT = "page-stack min-w-0 2xl:contents";

/** 帳戶頁的卡片 同一列等寬等高 寬螢幕多排幾張 */
export const ACCOUNTS_GRID = "grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4";
