import { UNCATEGORIZED_KEY, accountStartDate, bySortOrder, expenseSliceKey, type AccountBalance, type AccountLike, type CategoryLike } from "../lib/ledger";
import { formatTwd } from "../lib/money";
import { formatMonth, formatMonthShort, type MonthKey } from "../lib/month";
import type { TransactionView } from "../service/transactions";
import type { EntryFormOptions, SalaryAccountOption } from "./components/forms/options";
import { SAVINGS_PATHS } from "./paths";

// 伺服器元件整理好畫面與表單要的形狀 交給 client 元件的只帶用得到的欄位

/** 這個月寫本月 同一年只寫月份 不同年才加年份 */
export function periodLabel(month: MonthKey, current: MonthKey): string {
  if (month === current) return "本月";
  return month.slice(0, 4) === current.slice(0, 4) ? formatMonthShort(month) : formatMonth(month);
}

/** 一律到小數一位 同一欄才對得齊 四捨五入成 0 的負數不寫成 -0.0% */
export function formatPercent(percent: number): string {
  const fixed = percent.toFixed(1);
  return `${fixed === "-0.0" ? "0.0" : fixed}%`;
}

/** 賺賠這類有方向的百分比 正的帶加號 四捨五入成 0 時不帶 */
export function formatSignedPercent(percent: number): string {
  const text = formatPercent(percent);
  return percent > 0 && text !== "0.0%" ? `+${text}` : text;
}

/**
 * 圓餅圖只畫正的餘額 負的寫在圖下面
 * 數字卡的總資產是扣掉它們的淨值 兩個數字才對得起來
 */
export function excludedNote(accounts: { name: string; balance: number }[]): string {
  return `不含負餘額：${accounts.map((account) => `${account.name} ${formatTwd(account.balance)}`).join("、")}`;
}

/**
 * 本月不帶 month 跟切換月份的連結一樣
 * 有 sliceKey 時帶上 category 紀錄頁一打開就篩好
 */
export function recordsHref(month: MonthKey | null, sliceKey?: string): string {
  const params = new URLSearchParams();
  if (month !== null) params.set("month", month);
  if (sliceKey !== undefined) params.set("category", sliceKey === UNCATEGORIZED_KEY ? UNCATEGORIZED_KEY : sliceKey.replace(/^category:/, ""));
  const query = params.toString();
  return query ? `${SAVINGS_PATHS.records}?${query}` : SAVINGS_PATHS.records;
}

/** 停用的帳戶不算進總覽與表單 順序跟設定頁一樣 */
export function activeAccountsInOrder<T extends Pick<AccountLike, "id" | "active" | "sortOrder">>(accounts: T[]): T[] {
  return accounts.filter((account) => account.active).sort(bySortOrder);
}

/**
 * 扣款帳戶是信用卡換成轉帳時繳卡費的轉出
 * 開始記帳的日期是日期欄位的下限
 */
export const formExtras = (account: AccountLike) => ({ payFromAccountId: account.payFromAccountId, startDate: accountStartDate(account) });

export function entryFormOptions(accounts: AccountLike[], categories: CategoryLike[], today: string): EntryFormOptions {
  return {
    accounts: activeAccountsInOrder(accounts).map((account) => ({ id: account.id, name: account.name, kind: account.kind, ...formExtras(account) })),
    categories: categories.map(({ id, name, kind, color }) => ({ id, name, kind, color })),
    today,
  };
}

/** 建議金額要看目前的餘額 不是選到的月份的月底 */
export function salaryAccountOptions(accounts: AccountLike[], balances: Map<number, AccountBalance>): SalaryAccountOption[] {
  return activeAccountsInOrder(accounts).map((account) => ({
    id: account.id,
    name: account.name,
    kind: account.kind,
    ...formExtras(account),
    balance: balances.get(account.id)?.balance ?? 0,
    monthlyPlan: account.monthlyPlan,
    targetAmount: account.targetAmount,
    sortOrder: account.sortOrder,
  }));
}

/** 點支出圓餅圖的一片時列出這個分類這個月的紀錄 */
export type ExpenseRecord = { id: number; date: string; sliceKey: string; accountName: string; note: string | null; amount: number; recurring: boolean };

type RecordSource = Pick<TransactionView, "id" | "kind" | "categoryId" | "date" | "accountName" | "note" | "amount" | "recurring">;

/** 跟 lib/ledger 的 expenseSlices 同一套 沒分類或找不到的都算未分類 */
export function expenseRecords(transactions: RecordSource[], categories: Pick<CategoryLike, "id" | "kind">[]): ExpenseRecord[] {
  const known = new Set(categories.filter((category) => category.kind === "expense").map((category) => category.id));
  return transactions
    .filter((transaction) => transaction.kind === "expense")
    .map(({ id, categoryId, date, accountName, note, amount, recurring }) => ({
      id,
      date,
      sliceKey: categoryId !== null && known.has(categoryId) ? expenseSliceKey(categoryId) : UNCATEGORIZED_KEY,
      accountName,
      note,
      amount,
      recurring,
    }));
}
