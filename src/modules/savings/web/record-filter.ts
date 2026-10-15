import { UNCATEGORIZED_KEY } from "../lib/ledger";
import { parseRowId } from "../lib/validation";
import type { TransactionView } from "../service/transactions";

/** 伺服器整理好的純資料 瀏覽器只在這上面篩選 不帶 userId 與 createdAt */
export type RecordItem = Pick<
  TransactionView,
  "id" | "kind" | "accountId" | "accountName" | "counterAccountId" | "counterAccountName" | "categoryId" | "categoryName" | "categoryColor" | "amount" | "date" | "note" | "recurring"
>;

/** 下拉選單的值 空字串是不篩選 category 也可以是 UNCATEGORIZED_KEY */
export type RecordFilters = { account: string; category: string; kind: string };

export const NO_FILTERS: RecordFilters = { account: "", category: "", kind: "" };

export function hasFilters(filters: RecordFilters): boolean {
  return filters.account !== "" || filters.category !== "" || filters.kind !== "";
}

/** 網址的 category 參數只認自己的分類 id 或未分類 其他一律不篩選 */
export function categoryFilterFrom(raw: string | string[] | undefined, categories: readonly { id: number }[]): string {
  if (raw === UNCATEGORIZED_KEY) return UNCATEGORIZED_KEY;
  const id = parseRowId(raw);
  return id !== null && categories.some((category) => category.id === id) ? String(id) : "";
}

function matches(record: RecordItem, { account, category, kind }: RecordFilters): boolean {
  if (kind !== "" && record.kind !== kind) return false;
  // 轉帳的轉出與轉入都是這個帳戶的紀錄
  if (account !== "" && String(record.accountId) !== account && String(record.counterAccountId) !== account) return false;
  // 轉帳和調整本來就沒有分類 未分類只算收入與支出
  if (category === UNCATEGORIZED_KEY) return (record.kind === "income" || record.kind === "expense") && record.categoryId === null;
  return category === "" || String(record.categoryId) === category;
}

export function filterRecords(records: readonly RecordItem[], filters: RecordFilters): RecordItem[] {
  return hasFilters(filters) ? records.filter((record) => matches(record, filters)) : [...records];
}

/** 伺服器已經依日期排好 相鄰同一天的併成一組 */
export function groupByDate(records: readonly RecordItem[]): { date: string; records: RecordItem[] }[] {
  const groups: { date: string; records: RecordItem[] }[] = [];
  for (const record of records) {
    const last = groups.at(-1);
    if (last?.date === record.date) last.records.push(record);
    else groups.push({ date: record.date, records: [record] });
  }
  return groups;
}

/** 轉帳與調整不算收入也不算支出 */
export function recordTotals(records: readonly RecordItem[]): { income: number; expense: number } {
  let income = 0;
  let expense = 0;
  for (const record of records) {
    if (record.kind === "income") income += record.amount;
    else if (record.kind === "expense") expense += record.amount;
  }
  return { income, expense };
}
