import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import type { SavingsEntry, SavingsGoal } from "../data/schema";
import type { MonthKey } from "../lib/month";
import type { MonthGoalTotal } from "../lib/summary";
import { savingsTags } from "./cache-tags";
import { entryTotals, listGoals, listMonthEntries } from "./savings";

// 只給頁面用；同一次請求裡重複呼叫會自動合併，不必再包 React cache
// userId 一律是頁面從 session 拿到的登入者，會成為快取 key：每個人各自一份

export async function cachedGoals(userId: string): Promise<SavingsGoal[]> {
  "use cache: remote";
  cacheLife("db");
  cacheTag(savingsTags.goals);
  return listGoals(userId);
}

export async function cachedEntryTotals(userId: string): Promise<MonthGoalTotal[]> {
  "use cache: remote";
  cacheLife("db");
  cacheTag(savingsTags.entries, savingsTags.totals);
  return entryTotals(userId);
}

export async function cachedMonthEntries(userId: string, month: MonthKey): Promise<SavingsEntry[]> {
  "use cache: remote";
  cacheLife("db");
  cacheTag(savingsTags.entries, savingsTags.month(month));
  return listMonthEntries(userId, month);
}
