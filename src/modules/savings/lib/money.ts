// 擋掉多打幾個 0 的手誤 單筆在 int 範圍內 但累計可能超過所以加總用 bigint
export const MAX_AMOUNT = 100_000_000;

const twd = new Intl.NumberFormat("zh-TW", { style: "currency", currency: "TWD", maximumFractionDigits: 0 });
const signedTwd = new Intl.NumberFormat("zh-TW", { style: "currency", currency: "TWD", maximumFractionDigits: 0, signDisplay: "exceptZero" });

export function formatTwd(amount: number): string {
  return twd.format(amount);
}

/** 收入與調整這類有方向的金額 正數帶加號 0 不帶符號 */
export function formatSignedTwd(amount: number): string {
  return signedTwd.format(amount);
}

const plain = new Intl.NumberFormat("zh-TW", { maximumFractionDigits: 0 });

/** 股數這類不是錢的整數 加千分位 */
export function formatNumber(value: number): string {
  return plain.format(value);
}
