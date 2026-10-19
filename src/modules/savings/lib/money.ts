import { groupDigits } from "@/core/number";

// 擋掉多打幾個 0 的手誤 單筆在 int 範圍內 但累計可能超過所以加總用 bigint
export const MAX_AMOUNT = 100_000_000;

// 跟 core/number 一樣自己組 不用 Intl.NumberFormat 執行環境的語系資料不同時輸出才不會變
// 小數照絕對值四捨五入 -2.5 是 -3 負的 0 也帶負號 跟以前的寫法一樣
function parts(value: number): { negative: boolean; digits: string } {
  return { negative: value < 0 || Object.is(value, -0), digits: groupDigits(Math.round(Math.abs(value))) };
}

export function formatTwd(amount: number): string {
  const { negative, digits } = parts(amount);
  return `${negative ? "-" : ""}$${digits}`;
}

/** 收入與調整這類有方向的金額 正數帶加號 0 不帶符號 */
export function formatSignedTwd(amount: number): string {
  const { negative, digits } = parts(amount);
  if (digits === "0") return "$0";
  return `${negative ? "-" : "+"}$${digits}`;
}

/** 股數這類不是錢的整數 加千分位 */
export function formatNumber(value: number): string {
  const { negative, digits } = parts(value);
  return `${negative ? "-" : ""}${digits}`;
}
