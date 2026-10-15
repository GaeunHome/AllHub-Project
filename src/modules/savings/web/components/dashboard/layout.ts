// 內容與骨架共用 排得一樣串流進來時才不會跳
// 放在一般模組 伺服器元件才拿得到字串 從 use client 檔案匯入的只是參照

/**
 * 圖例限寬並整組置中 名稱跟金額才不會隔太遠
 * 靠上排 旁邊的卡片展開紀錄變高時這張不會跟著移動
 */
export const DONUT_LAYOUT = "grid justify-items-center gap-5 @lg:grid-cols-[auto_minmax(0,24rem)] @lg:items-center @lg:justify-center @lg:justify-items-stretch @lg:gap-10";

/**
 * auto-fit 收掉沒用到的欄 帳戶少時撐滿 不空下一兩欄
 * 欄數上限 --fin-cols 由 balancedColumns 算 樣式在 globals.css
 */
export const ACCOUNT_GRID = "fin-account-grid";

/**
 * 最寬排得下 6 欄 上限照帳戶數平均分 每列一樣多 8 個是兩列各 4 個
 * 比較窄時照卡片最小寬度 17rem 少排幾欄
 */
export function balancedColumns(count: number, widest = 6): number {
  if (count <= 0) return 1;
  return Math.ceil(count / Math.ceil(count / widest));
}

/** 手機兩欄 總資產佔一整列 寬螢幕五張並排 */
export const KPI_GRID = "grid grid-cols-2 gap-4 lg:grid-cols-5";

/** 兩張圓餅圖 以及預算與趨勢 寬螢幕各排成兩欄 */
export const DONUT_ROW = "grid gap-8 lg:grid-cols-2";
export const BUDGET_TREND_ROW = "grid gap-8 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]";
