import { accountStartDate, bySortOrder, type AccountBalance, type AccountLike, type CategoryLike } from "../lib/ledger";
import type { AccountsState } from "./accounts-state";
import type { AccountOption, CategoryOption, EntryFormOptions, SalaryAccountOption } from "./components/forms/options";
import type { BalanceAccount } from "./components/forms/update-balance";

// 伺服器整理好交給表單的選項 client 元件只拿到用得到的欄位

/** 停用的帳戶不算進總覽與表單 順序跟帳戶頁一樣 */
export function activeAccountsInOrder<T extends Pick<AccountLike, "id" | "active" | "sortOrder">>(accounts: T[]): T[] {
  return accounts.filter((account) => account.active).sort(bySortOrder);
}

/**
 * 扣款帳戶是信用卡換成轉帳時繳卡費的轉出
 * 開始記帳的日期是日期欄位的下限
 */
export const formExtras = (account: AccountLike) => ({ payFromAccountId: account.payFromAccountId, startDate: accountStartDate(account) });

type CategoryChoice = Pick<CategoryLike, "id" | "name" | "kind"> & { icon?: string | null };

/** 交給表單的分類只帶這幾個欄位 */
export const categoryOptions = (categories: CategoryChoice[]): CategoryOption[] => categories.map(({ id, name, kind, icon }) => ({ id, name, kind, icon: icon ?? null }));

/** withHoldings 是有持股的投資帳戶 一般轉帳轉不進也轉不出 要用買進賣出 */
export function entryFormOptions(accounts: AccountLike[], categories: CategoryChoice[], today: string, withHoldings: ReadonlySet<number> = new Set()): EntryFormOptions {
  return {
    accounts: activeAccountsInOrder(accounts).map((account) => ({ id: account.id, name: account.name, kind: account.kind, ...formExtras(account), withHoldings: withHoldings.has(account.id) })),
    categories: categoryOptions(categories),
    today,
  };
}

/** 繳卡費與買賣股票只能用存款帳戶 */
export function depositOptions(accounts: AccountLike[]): AccountOption[] {
  return activeAccountsInOrder(accounts)
    .filter((account) => account.kind === "deposit")
    .map((account) => ({ id: account.id, name: account.name, kind: account.kind, ...formExtras(account) }));
}

/** 建議金額要看目前的餘額 有持股的投資帳戶不能入帳也不能轉入 不列 */
export function salaryAccountOptions(accounts: AccountLike[], balances: Map<number, AccountBalance>, withHoldings: ReadonlySet<number>): SalaryAccountOption[] {
  return activeAccountsInOrder(accounts)
    .filter((account) => !withHoldings.has(account.id))
    .map((account) => ({
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

/** 能更新餘額的帳戶 信用卡照帳單繳 有持股的投資帳戶照股價算 都不列 */
export function balanceAccounts(accounts: AccountLike[], state: Pick<AccountsState, "balances" | "withHoldings">): BalanceAccount[] {
  return activeAccountsInOrder(accounts).flatMap((account) =>
    account.kind === "credit" || state.withHoldings.has(account.id) ? [] : [{ id: account.id, name: account.name, kind: account.kind, balance: state.balances.get(account.id)?.balance ?? 0 }],
  );
}
