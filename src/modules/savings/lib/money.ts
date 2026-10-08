// 擋掉多打幾個 0 的手誤；單筆在 int 範圍內，但累計可能超過，加總要用 bigint
export const MAX_AMOUNT = 100_000_000;

const twd = new Intl.NumberFormat("zh-TW", { style: "currency", currency: "TWD", maximumFractionDigits: 0 });

export function formatTwd(amount: number): string {
  return twd.format(amount);
}
