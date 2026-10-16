import "server-only";
import { CARD_FLOW_DAYS } from "../lib/cards";
import { addDays, taipeiToday } from "../lib/dates";
import { pendingItems } from "../lib/pending";
import { quoteSymbols } from "../lib/quotes";
import { cachedAccountFlows, cachedAccounts, cachedCardBills, cachedCardFlows, cachedCategories, cachedHoldings, cachedQuotes, cachedRecurring } from "../service/cached";
import { accountsState, type AccountsInput, type AccountsState } from "./dashboard-view";

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
