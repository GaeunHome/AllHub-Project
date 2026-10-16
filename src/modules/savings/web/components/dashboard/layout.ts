// 內容與骨架共用 排得一樣串流進來時才不會跳
// 放在一般模組 伺服器元件才拿得到字串 從 use client 檔案匯入的只是參照

/**
 * 寬螢幕兩欄 左邊待處理與帳戶 右邊本月支出與趨勢
 * 每一欄各自是 page-stack 不從外框挑第幾個子元素
 */
export const OVERVIEW_COLUMNS = "grid gap-8 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] xl:items-start";

/**
 * 超寬螢幕的左欄放得下時待處理與帳戶並排 清單才不會拉得太長
 * auto-fit 在沒有待處理時讓帳戶撐滿 不必知道有沒有待處理
 */
export const OVERVIEW_LEFT = "page-stack min-w-0 2xl:grid 2xl:grid-cols-[repeat(auto-fit,minmax(min(100%,26rem),1fr))] 2xl:items-start";

export const OVERVIEW_RIGHT = "page-stack min-w-0";
