import "server-only";
import { and, asc, eq, inArray, lt } from "drizzle-orm";
import { db } from "@/core/db";
import { coreUsers } from "@/core/db/schema";
import { activeOwnerOf } from "@/core/db/users";
import { reportService } from "@/core/status";
import { savingsAccounts, savingsAssetDays, savingsHoldings, type SavingsAccount, type SavingsHolding } from "../data/schema";
import { addDays, taipeiToday } from "../lib/dates";
import { investmentTotals } from "../lib/holdings";
import { accountBalances, assetSummary } from "../lib/ledger";
import type { Quote } from "../lib/quotes";
import { trendStart, TREND_DAYS, type AssetSnapshot } from "../lib/trend";
import { fetchQuotes } from "./quotes";
import { accountMonthFlows } from "./transactions";

// 資產走勢 使用者選的近 30 天每天記一筆 存款照紀錄回推 只存投資的市值

/** 這個人記下的每一天 排程只留 30 天 舊的在前 */
export async function listAssetDays(userId: string): Promise<AssetSnapshot[]> {
  return db()
    .select({ day: savingsAssetDays.day, investment: savingsAssetDays.investment })
    .from(savingsAssetDays)
    .where(eq(savingsAssetDays.userId, userId))
    .orderBy(asc(savingsAssetDays.day));
}

/** 擁有者沒停用 能用理財的人 啟用中的證券帳戶與持股 */
async function investorsOf(): Promise<{ accounts: Map<string, SavingsAccount[]>; holdings: Map<string, SavingsHolding[]> }> {
  const accounts = await db()
    .select({ account: savingsAccounts })
    .from(savingsAccounts)
    .innerJoin(coreUsers, activeOwnerOf(savingsAccounts.userId, "savings"))
    .where(and(eq(savingsAccounts.kind, "investment"), eq(savingsAccounts.active, true)));
  const owners = [...new Set(accounts.map(({ account }) => account.userId))];
  const holdings = owners.length === 0 ? [] : await db().select().from(savingsHoldings).where(inArray(savingsHoldings.userId, owners));
  return {
    accounts: Map.groupBy(
      accounts.map(({ account }) => account),
      (account) => account.userId,
    ),
    holdings: Map.groupBy(holdings, (holding) => holding.userId),
  };
}

/** 跟頁面的總資產同一套算法 有一檔讀不到收盤價就是 null 不把成本當成市值 */
async function investmentValue(userId: string, accounts: SavingsAccount[], holdings: SavingsHolding[], quotes: readonly Quote[] | null): Promise<number | null> {
  const investments = investmentTotals(holdings, quotes);
  if ([...investments.values()].some((total) => !total.priced)) return null;
  return assetSummary(accounts, accountBalances(accounts, await accountMonthFlows(userId)), investments).investment.value;
}

/** 摘要只有數字 不寫金額與使用者 */
function summary(recorded: number, unpriced: number, removed: number): string {
  const parts = [
    `記下 ${recorded} 人的投資市值`,
    unpriced > 0 && `${unpriced} 人的收盤價讀不到，今天略過`,
    removed > 0 && `清掉 ${removed} 筆超過 ${TREND_DAYS} 天的`,
  ].filter((part): part is string => typeof part === "string");
  return parts.join("，");
}

/**
 * 記下前一天的市值 同一天重跑覆蓋那一列 圖上看不到的舊日子每個人都清掉
 * 停用或沒有理財權限的人略過 那幾天畫面照成本算
 */
export async function recordAssetDays(now = new Date(), fetchImpl?: typeof fetch): Promise<string> {
  const today = taipeiToday(now);
  const day = addDays(today, -1);
  const removed = await db().delete(savingsAssetDays).where(lt(savingsAssetDays.day, trendStart(today))).returning({ userId: savingsAssetDays.userId });
  const { accounts, holdings } = await investorsOf();
  if (accounts.size === 0) return summary(0, 0, removed.length);

  const anyHoldings = [...holdings.values()].some((rows) => rows.length > 0);
  const fetched = anyHoldings ? await fetchQuotes(fetchImpl) : null;
  if (fetched) await reportService("savings:quotes", !fetched.ok ? "兩邊的收盤價都讀不到" : fetched.complete ? null : "只讀到其中一邊的收盤價");
  const quotes = fetched?.ok ? fetched.quotes : null;

  let [recorded, unpriced] = [0, 0];
  for (const [userId, own] of accounts) {
    const investment = await investmentValue(userId, own, holdings.get(userId) ?? [], quotes);
    if (investment === null) {
      unpriced++;
      continue;
    }
    const updatedAt = new Date();
    await db()
      .insert(savingsAssetDays)
      .values({ userId, day, investment, updatedAt })
      .onConflictDoUpdate({ target: [savingsAssetDays.userId, savingsAssetDays.day], set: { investment, updatedAt } });
    recorded++;
  }
  return summary(recorded, unpriced, removed.length);
}
