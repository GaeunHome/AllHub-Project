import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import type { SavingsAccount, SavingsCategory, SavingsPurpose, SavingsRecurring } from "../data/schema";
import type { AccountMonthFlow, CategoryMonthTotal } from "../lib/ledger";
import type { MonthKey } from "../lib/month";
import { listAccounts } from "./accounts";
import { savingsTags } from "./cache-tags";
import { listCategories } from "./categories";
import { listPurposes } from "./purposes";
import { listRecurring } from "./recurring";
import { accountMonthFlows, categoryMonthTotals, listMonthTransactions, type TransactionView } from "./transactions";

// 只給頁面用 同一次請求裡重複呼叫會自動合併 不必再包 React cache
// userId 是頁面從 session 拿到的登入者 會成為快取 key 每人各一份

export async function cachedAccounts(userId: string): Promise<SavingsAccount[]> {
  "use cache: remote";
  cacheLife("db");
  cacheTag(savingsTags.accounts);
  return listAccounts(userId);
}

export async function cachedPurposes(userId: string): Promise<SavingsPurpose[]> {
  "use cache: remote";
  cacheLife("db");
  cacheTag(savingsTags.purposes);
  return listPurposes(userId);
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

/** 名稱是查詢時 join 的 帳戶或分類改名或刪除都會影響 */
export async function cachedMonthTransactions(userId: string, month: MonthKey): Promise<TransactionView[]> {
  "use cache: remote";
  cacheLife("db");
  cacheTag(savingsTags.transactions, savingsTags.accounts, savingsTags.categories);
  return listMonthTransactions(userId, month);
}
