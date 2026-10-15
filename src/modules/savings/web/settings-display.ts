import { ACCOUNT_KIND_LABELS, type AccountKind } from "../lib/kinds";
import { formatTwd } from "../lib/money";
import { scheduleLabel } from "./entry-display";

type AccountSettings = { kind: AccountKind; monthlyPlan: number | null; targetAmount: number | null; dueDay: number | null; payFromName: string | null };

/** 只寫自己設的金額與日期 沒有帳號或卡號 */
export function accountDetail(account: AccountSettings): string {
  const parts: string[] = [ACCOUNT_KIND_LABELS[account.kind]];
  if (account.kind === "credit") {
    if (account.dueDay) parts.push(`${scheduleLabel(account.dueDay)}繳款`);
    if (account.payFromName) parts.push(`從「${account.payFromName}」扣款`);
  } else {
    if (account.monthlyPlan) parts.push(`每月規劃 ${formatTwd(account.monthlyPlan)}`);
    if (account.targetAmount) parts.push(`目標 ${formatTwd(account.targetAmount)}`);
  }
  return parts.join(" · ");
}

/** 刪除帳戶前要知道的 紀錄筆數要另外查資料庫 這裡只說有沒有 */
export type AccountUsage = { recurringCount: number; hasRecords: boolean; hasTransfers: boolean };

/** 紀錄與固定收支會一起刪 確認時要寫清楚 也提醒不用了可以停用 */
export function accountDeleteWarning(name: string, { recurringCount, hasRecords, hasTransfers }: AccountUsage): string {
  const rules = recurringCount > 0 ? `${recurringCount} 筆固定收支` : "";
  if (!hasRecords) return `確定刪除「${name}」？這個帳戶還沒有任何紀錄。${rules ? `${rules}會一起刪除。` : ""}`;
  const paragraphs = [`確定刪除「${name}」？這個帳戶的所有紀錄${rules ? `和 ${rules}` : ""}都會一起刪除，無法復原。`];
  // 轉帳是兩個帳戶共用的一筆紀錄 刪掉後另一個帳戶的餘額也會變
  if (hasTransfers) paragraphs.push("跟其他帳戶之間的轉帳也會一起刪除，那些帳戶的餘額會跟著改變。");
  paragraphs.push("只是不再使用的話，可以改成「停用」，紀錄會留著。");
  return paragraphs.join("\n\n");
}

export function purposeDeleteWarning(name: string, accountCount: number): string {
  const usage = accountCount > 0 ? `用了這個用途的 ${accountCount} 個帳戶會改成「未設定」，帳戶和紀錄都會留著。` : "";
  return `確定刪除用途「${name}」？${usage}`;
}
