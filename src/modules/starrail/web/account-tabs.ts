/**
 * 一次只看一個帳號 選擇放在網址參數 伺服器算繪讀得到 重新整理也保留
 * 認不得的值改看第一個帳號
 */
export function pickAccount<T extends { id: number }>(accounts: T[], requested: string | string[] | undefined): T | null {
  if (accounts.length === 0) return null;
  const id = typeof requested === "string" ? Number(requested) : NaN;
  return accounts.find((account) => account.id === id) ?? accounts[0];
}
