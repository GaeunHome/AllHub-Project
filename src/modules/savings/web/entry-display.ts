import { TRANSACTION_KIND_LABELS, type AccountKind, type TransactionKind } from "../lib/kinds";
import { formatSignedTwd, formatTwd } from "../lib/money";

/** 沒有分類的收支 選單 篩選與列的說明共用這個名稱 */
export const UNCATEGORIZED_LABEL = "未分類";

type EntryNames = { kind: TransactionKind; accountName: string; counterAccountName: string | null; categoryName: string | null; note: string | null };

const uncategorized = (entry: EntryNames) => (entry.kind === "income" || entry.kind === "expense") && entry.categoryName === null;

/**
 * 收支沒有分類時用備註當名稱 一排未分類認不出是哪一筆
 * accountKind 是這筆紀錄的帳戶類型
 */
export function entryTitle(entry: EntryNames, accountKind?: AccountKind): string {
  if (entry.kind === "transfer") return `${entry.accountName} → ${entry.counterAccountName ?? "已刪除的帳戶"}`;
  // 信用卡的調整是未繳的增減 金額也照未繳的方向寫
  if (entry.kind === "adjust") return accountKind === "credit" ? "調整未繳" : TRANSACTION_KIND_LABELS.adjust;
  return entry.categoryName ?? entry.note ?? UNCATEGORIZED_LABEL;
}

/** 名稱下面那行 轉帳的帳戶已經在名稱裡 備註當了名稱就改寫未分類 */
export function entryDetails(entry: EntryNames): string[] {
  if (entry.kind === "transfer") return entry.note ? [entry.note] : [];
  if (uncategorized(entry) && entry.note) return [UNCATEGORIZED_LABEL, entry.accountName];
  return entry.note ? [entry.accountName, entry.note] : [entry.accountName];
}

export type AmountTone = "income" | "expense" | "neutral";

/**
 * 轉帳只是搬錢 調整是對帳 都用中性的顏色
 * 信用卡的調整照未繳的方向寫 餘額多 480 就是未繳少 480
 */
export function signedAmount(kind: TransactionKind, amount: number, accountKind?: AccountKind): { text: string; tone: AmountTone } {
  switch (kind) {
    case "income":
      return { text: formatSignedTwd(amount), tone: "income" };
    case "expense":
      return { text: formatSignedTwd(-amount), tone: "expense" };
    case "transfer":
      return { text: formatTwd(amount), tone: "neutral" };
    case "adjust":
      return { text: formatSignedTwd(accountKind === "credit" ? 0 - amount : amount), tone: "neutral" };
  }
}

export const AMOUNT_TONE_CLASS: Record<AmountTone, string> = { income: "text-success", expense: "text-ink", neutral: "text-ink-soft" };

export function scheduleLabel(dayOfMonth: number): string {
  return `每月 ${dayOfMonth} 日`;
}
