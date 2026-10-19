// 數字的顯示 跟 time.ts 一樣自己組 不用 Intl.NumberFormat 或 toLocaleString
// 執行環境的語系資料不同時輸出才不會變

/** 加千分位 先用 Math.round 取整數 負數保留負號 例如 -1500 寫成 -1,500 */
export function groupDigits(value: number): string {
  const sign = value < 0 ? "-" : "";
  return sign + String(Math.abs(Math.round(value))).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}
