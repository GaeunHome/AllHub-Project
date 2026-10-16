import type { AccountKind } from "../lib/kinds";
import { formatTwd } from "../lib/money";

type AccountSettings = {
  kind: AccountKind;
  purposeName: string | null;
  monthlyPlan: number | null;
  targetAmount: number | null;
  dueDay: number | null;
  statementDay: number | null;
  payFromName: string | null;
  autopay: boolean;
};

/**
 * 設定頁帳戶那一列的說明 只寫自己設的 沒有帳號或卡號
 * 已經照類型分組 所以不再寫類型
 */
export function accountDetail(account: AccountSettings): string {
  if (account.kind !== "credit") {
    return [account.purposeName, account.monthlyPlan && `每月規劃 ${formatTwd(account.monthlyPlan)}`, account.targetAmount && `目標 ${formatTwd(account.targetAmount)}`].filter(Boolean).join(" · ");
  }
  // 照一期的順序 先結帳再截止
  const days = [account.statementDay && `${account.statementDay} 日結帳`, account.dueDay && `${account.dueDay} 日截止`].filter(Boolean);
  return [days.length > 0 && `每月 ${days.join(" · ")}`, account.payFromName && `從「${account.payFromName}」扣款`, account.autopay && "自動扣繳"].filter(Boolean).join(" · ");
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

/**
 * 固定收支照下一期的日期排 同一天照建立的順序
 * 停用或帳戶停用的沒有下一期 排在最後
 */
export function sortByNextDate<T extends { id: number; active: boolean; accountPaused: boolean; nextDate: string | null }>(rules: readonly T[]): T[] {
  const nextOf = (rule: T) => (rule.active && !rule.accountPaused ? rule.nextDate : null);
  return [...rules].sort((a, b) => {
    const [x, y] = [nextOf(a), nextOf(b)];
    if (x !== y) return x === null ? 1 : y === null ? -1 : x < y ? -1 : 1;
    return a.id - b.id;
  });
}
