import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import type { SavingsAccount, SavingsCategory, SavingsHolding, SavingsRecurring } from "../data/schema";
import type { CardDailyFlow } from "../lib/cards";
import type { ChecklistRecord } from "../lib/checklist";
import type { DateKey } from "../lib/dates";
import type { AccountMonthFlow, CategoryMonthTotal } from "../lib/ledger";
import type { MonthKey } from "../lib/month";
import { quoteSymbols, type Quote } from "../lib/quotes";
import { listAccounts } from "./accounts";
import { savingsTags } from "./cache-tags";
import { cardDailyFlows, listCardBills, type CardBillRecord } from "./cards";
import { listCategories } from "./categories";
import { listHoldings } from "./holdings";
import { fetchQuotes } from "./quotes";
import { listRecurring } from "./recurring";
import { accountMonthFlows, categoryMonthTotals, listMonthTransactions, recurringRecords, type TransactionView } from "./transactions";

// 只給頁面用 同一次請求裡重複呼叫會自動合併 不必再包 React cache
// userId 是頁面從 session 拿到的登入者 會成為快取 key 每人各一份

export async function cachedAccounts(userId: string): Promise<SavingsAccount[]> {
  "use cache: remote";
  cacheLife("db");
  cacheTag(savingsTags.accounts);
  return listAccounts(userId);
}

export async function cachedCategories(userId: string): Promise<SavingsCategory[]> {
  "use cache: remote";
  cacheLife("db");
  cacheTag(savingsTags.categories);
  return listCategories(userId);
}

export async function cachedRecurring(userId: string): Promise<SavingsRecurring[]> {
  "use cache: remote";
  cacheLife("db");
  cacheTag(savingsTags.recurring);
  return listRecurring(userId);
}

export async function cachedAccountFlows(userId: string): Promise<AccountMonthFlow[]> {
  "use cache: remote";
  cacheLife("db");
  cacheTag(savingsTags.transactions);
  return accountMonthFlows(userId);
}

export async function cachedCategoryTotals(userId: string): Promise<CategoryMonthTotal[]> {
  "use cache: remote";
  cacheLife("db");
  cacheTag(savingsTags.transactions);
  return categoryMonthTotals(userId);
}

/** 名稱與代號是查詢時 join 的 帳戶 分類 持股 固定收支改名或刪除都會影響 */
export async function cachedMonthTransactions(userId: string, month: MonthKey): Promise<TransactionView[]> {
  "use cache: remote";
  cacheLife("db");
  cacheTag(savingsTags.transactions, savingsTags.accounts, savingsTags.categories, savingsTags.holdings, savingsTags.recurring);
  return listMonthTransactions(userId, month);
}

/** 這個月要做的事對期別用 since 每個月往後推 key 每個月換一次 */
export async function cachedRecurringRecords(userId: string, since: DateKey): Promise<ChecklistRecord[]> {
  "use cache: remote";
  cacheLife("db");
  cacheTag(savingsTags.transactions);
  return recurringRecords(userId, since);
}

export async function cachedHoldings(userId: string): Promise<SavingsHolding[]> {
  "use cache: remote";
  cacheLife("db");
  cacheTag(savingsTags.holdings);
  return listHoldings(userId);
}

/** since 每天往後推 key 每天換一次 查詢時 join 帳戶挑出信用卡 */
export async function cachedCardFlows(userId: string, since: DateKey): Promise<CardDailyFlow[]> {
  "use cache: remote";
  cacheLife("db");
  cacheTag(savingsTags.transactions, savingsTags.accounts);
  return cardDailyFlows(userId, since);
}

/** 繳了多少看紀錄 結帳日算到哪一天看卡的設定 */
export async function cachedCardBills(userId: string): Promise<CardBillRecord[]> {
  "use cache: remote";
  cacheLife("db");
  cacheTag(savingsTags.bills, savingsTags.transactions, savingsTags.accounts);
  return listCardBills(userId);
}

/**
 * 持股的收盤價 只回傳這些代號的 讀不到股價清單時是 null
 * 沒有持股時不呼叫外部服務 代號排序去重後才當快取 key
 */
export async function cachedQuotes(symbols: readonly string[]): Promise<Quote[] | null> {
  const key = quoteSymbols(symbols);
  return key.length === 0 ? [] : quotesOf(key);
}

// 股價一天更新一次 不存資料庫 只有一個來源讀到時也用短效期 幾分鐘後再試
async function quotesOf(symbols: string[]): Promise<Quote[] | null> {
  "use cache: remote";
  cacheTag(savingsTags.external);
  const result = await fetchQuotes();
  if (!result.ok) {
    cacheLife("external");
    return null;
  }
  if (result.complete) cacheLife("quotes");
  else cacheLife("external");
  const wanted = new Set(symbols);
  return result.quotes.filter((quote) => wanted.has(quote.symbol));
}
