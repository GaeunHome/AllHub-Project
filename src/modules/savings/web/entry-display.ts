import type { UiIconName } from "@/core/ui/icon";
import { tradeNote } from "../lib/holdings";
import { TRANSACTION_KIND_LABELS, categoryIconOf, type AccountKind, type TransactionKind } from "../lib/kinds";
import { formatNumber, formatSignedTwd, formatTwd } from "../lib/money";

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

/** 買賣持股的紀錄 shares 買進是正的 賣出是負的 持股刪掉後沒有代號 */
type TradeNames = { shares: number | null; holdingSymbol: string | null };

export function isTrade(record: TradeNames & { kind: TransactionKind }): boolean {
  return record.kind === "transfer" && record.shares !== null && record.shares !== 0;
}

export function tradeTitle({ shares, holdingSymbol }: TradeNames): string {
  const count = formatNumber(Math.abs(shares ?? 0));
  return `${(shares ?? 0) > 0 ? "買進" : "賣出"}${holdingSymbol ? ` ${holdingSymbol}` : ""} · ${count} 股`;
}

// 比對時去掉空白與千分位 預設備註寫法稍有不同也認得出來
const compact = (text: string) => text.replace(/[\s,]/g, "");

/** 沒改過的預設備註就是名稱那一句 不再寫一次 */
function isDefaultTradeNote(record: TradeNames & { note: string | null }): boolean {
  if (record.note === null || record.shares === null) return false;
  return compact(record.note) === compact(tradeNote(record.shares > 0 ? "buy" : "sell", record.holdingSymbol ?? "", Math.abs(record.shares)));
}

/** 紀錄頁一列前面的圖示 收支用分類選的 轉帳 調整 買賣各有固定的圖示 */
export function recordIcon(record: TradeNames & { kind: TransactionKind; categoryIcon: string | null }): UiIconName {
  if (isTrade(record)) return "chart-line";
  if (record.kind === "transfer") return "arrow-left-right";
  if (record.kind === "adjust") return "scale";
  return categoryIconOf(record.categoryIcon, record.kind);
}

/** 紀錄頁一列的名稱 買賣持股寫買進幾股 */
export function recordTitle(record: EntryNames & TradeNames, accountKind?: AccountKind): string {
  return isTrade(record) ? tradeTitle(record) : entryTitle(record, accountKind);
}

type RecordNames = EntryNames & TradeNames & { recurring: boolean; recurringName: string | null };

/**
 * 紀錄頁名稱下面那一行 買賣寫從哪個帳戶到哪個帳戶
 * 固定收支記的寫規則的名稱 跟名稱或備註重複 或規則沒有名稱時寫固定收支
 */
export function recordDetails(record: RecordNames): string[] {
  const parts = isTrade(record) ? [`${record.accountName} → ${record.counterAccountName ?? "已刪除的帳戶"}`, ...(record.note && !isDefaultTradeNote(record) ? [record.note] : [])] : entryDetails(record);
  if (!record.recurring) return parts;
  const name = record.recurringName;
  return [...parts, name === null || name === record.note || name === recordTitle(record) ? "固定收支" : name];
}

/**
 * 紀錄頁的金額 收入帶加號 支出帶減號 轉帳只是搬錢不帶符號
 * 信用卡的調整照未繳的方向寫 餘額多 480 就是未繳少 480
 */
export function signedAmount(kind: TransactionKind, amount: number, accountKind?: AccountKind): string {
  switch (kind) {
    case "income":
      return formatSignedTwd(amount);
    case "expense":
      return formatSignedTwd(-amount);
    case "transfer":
      return formatTwd(amount);
    case "adjust":
      return formatSignedTwd(accountKind === "credit" ? 0 - amount : amount);
  }
}
