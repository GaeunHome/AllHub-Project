import "server-only";
import { CARD_FLOW_DAYS } from "../lib/cards";
import { monthChecklist, type ChecklistItem } from "../lib/checklist";
import { addDays, taipeiToday, type DateKey } from "../lib/dates";
import { addMonths, dateToMonth, monthToDate } from "../lib/month";
import { pendingItems } from "../lib/pending";
import { quoteSymbols } from "../lib/quotes";
import { cachedAccountFlows, cachedAccounts, cachedCardBills, cachedCardFlows, cachedCategories, cachedHoldings, cachedQuotes, cachedRecurring, cachedRecurringRecords } from "../service/cached";
import type { AccountOption, CategoryOption, SalaryAccountOption } from "./components/forms/options";
import { accountsState, categoryOptions, depositOptions, pendingEntries, salaryAccountOptions, type AccountsInput, type AccountsState, type PendingEntry } from "./dashboard-view";

/**
 * 總資產 帳戶 待處理與首頁卡片都要的資料 都讀快取 同一次請求裡重複呼叫會合併
 * 沒有持股時不查股價 沒有信用卡時不查每天的流量與帳單
 */
export async function loadAccounts(userId: string, now: Date): Promise<{ input: AccountsInput; state: AccountsState }> {
  const today = taipeiToday(now);
  const [accounts, flows, holdings] = await Promise.all([cachedAccounts(userId), cachedAccountFlows(userId), cachedHoldings(userId)]);
  const symbols = quoteSymbols(holdings.map((holding) => holding.symbol));
  const cards = accounts.some((account) => account.kind === "credit");
  const [quotes, cardFlows, cardBills] = await Promise.all([
    symbols.length > 0 ? cachedQuotes(symbols) : null,
    cards ? cachedCardFlows(userId, addDays(today, -CARD_FLOW_DAYS)) : [],
    cards ? cachedCardBills(userId) : [],
  ]);
  const input: AccountsInput = { accounts, flows, holdings, quotes, cardFlows, cardBills, today };
  return { input, state: accountsState(input) };
}

/** 總覽的待處理與首頁卡片的幾筆從同一份算 才不會對不上 */
export async function loadPending(userId: string, now: Date) {
  const [{ input, state }, rules, categories] = await Promise.all([loadAccounts(userId, now), cachedRecurring(userId), cachedCategories(userId)]);
  const items = pendingItems(rules, [...state.bills.values()], input.today, { accounts: input.accounts, categories, holdings: input.holdings });
  return { input, state, rules, categories, items };
}

/**
 * entries 是要處理的那幾列的視窗內容 key 跟 items 的一樣
 * configured 是有啟用中的固定收支或信用卡 沒有時畫面改成去設定的提示
 */
export type ChecklistView = {
  items: ChecklistItem[];
  entries: PendingEntry[];
  payFromAccounts: AccountOption[];
  salaryAccounts: SalaryAccountOption[];
  categories: CategoryOption[];
  today: DateKey;
  configured: boolean;
};

export async function loadChecklist(userId: string, now: Date): Promise<ChecklistView> {
  // 提早確認的那一筆可能記在上個月 所以從上個月 1 號讀起
  const since = monthToDate(addMonths(dateToMonth(taipeiToday(now)), -1));
  const [{ input, state, rules, categories, items }, records] = await Promise.all([loadPending(userId, now), cachedRecurringRecords(userId, since)]);
  const context = { accounts: input.accounts, categories, holdings: input.holdings };
  return {
    items: monthChecklist({ rules, bills: [...state.bills.values()], statements: input.cardBills, records, context }, input.today),
    entries: pendingEntries(items, { accounts: input.accounts, rules, holdings: input.holdings, quotes: input.quotes, categories, fills: state.fills, today: input.today }),
    payFromAccounts: depositOptions(input.accounts),
    salaryAccounts: salaryAccountOptions(input.accounts, state.balances, state.withHoldings),
    categories: categoryOptions(categories),
    today: input.today,
    configured: rules.some((rule) => rule.active) || input.accounts.some((account) => account.kind === "credit" && account.active),
  };
}
