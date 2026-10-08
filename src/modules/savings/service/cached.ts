import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import type { SavingsEntry, SavingsGoal } from "../data/schema";
import type { MonthKey } from "../lib/month";
import type { MonthGoalTotal } from "../lib/summary";
import { savingsTags } from "./cache-tags";
import { entryTotals, listGoals, listMonthEntries } from "./savings";

// 只給頁面用；同一次請求裡重複呼叫會自動合併，不必再包 React cache

export async function cachedGoals(): Promise<SavingsGoal[]> {
  "use cache: remote";
  cacheLife("db");
  cacheTag(savingsTags.goals);
  return listGoals();
}

export async function cachedEntryTotals(): Promise<MonthGoalTotal[]> {
  "use cache: remote";
  cacheLife("db");
  cacheTag(savingsTags.entries, savingsTags.totals);
  return entryTotals();
}

export async function cachedMonthEntries(month: MonthKey): Promise<SavingsEntry[]> {
  "use cache: remote";
  cacheLife("db");
  cacheTag(savingsTags.entries, savingsTags.month(month));
  return listMonthEntries(month);
}
