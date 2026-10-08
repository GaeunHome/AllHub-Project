import type { MonthKey } from "./month";

export type GoalLike = { id: number; name: string; monthlyAmount: number; active: boolean };

/** goalId 為 null 時要看 goalName 才分得出來：null 是臨時存款，有值是已刪除的項目 */
export type MonthGoalTotal = { month: MonthKey; goalId: number | null; goalName: string | null; amount: number };

export type Summary = { planned: number; thisMonth: number; thisYear: number; allTime: number; activeGoals: number; doneGoals: number };

export type GoalStatus = "pending" | "partial" | "done";
export type GoalProgress<G extends GoalLike> = { goal: G; saved: number; remaining: number; status: GoalStatus };

export type GoalTotal = { key: string; label: string; tag: "已停用" | "已刪除" | null; amount: number };

const TEMPORARY_LABEL = "臨時存款";

// 金額很小的月份也留一點高度，才分得出「存了一點」和「沒存」
const MIN_VISIBLE_PERCENT = 2;

const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);

function addTo<K>(map: Map<K, number>, key: K, amount: number) {
  map.set(key, (map.get(key) ?? 0) + amount);
}

export function summarize(goals: GoalLike[], totals: MonthGoalTotal[], current: MonthKey): Summary {
  const active = goals.filter((g) => g.active);
  const thisMonth = totals.filter((t) => t.month === current);
  const yearPrefix = `${current.slice(0, 4)}-`;
  return {
    planned: sum(active.map((g) => g.monthlyAmount)),
    thisMonth: sum(thisMonth.map((t) => t.amount)),
    thisYear: sum(totals.filter((t) => t.month.startsWith(yearPrefix)).map((t) => t.amount)),
    allTime: sum(totals.map((t) => t.amount)),
    activeGoals: active.length,
    doneGoals: goalProgress(goals, thisMonth).filter((p) => p.status === "done").length,
  };
}

export function goalProgress<G extends GoalLike>(goals: G[], entries: { goalId: number | null; amount: number }[]): GoalProgress<G>[] {
  const saved = new Map<number, number>();
  for (const entry of entries) if (entry.goalId !== null) addTo(saved, entry.goalId, entry.amount);

  return goals
    .filter((goal) => goal.active)
    .map((goal) => {
      const amount = saved.get(goal.id) ?? 0;
      const status: GoalStatus = amount >= goal.monthlyAmount ? "done" : amount > 0 ? "partial" : "pending";
      return { goal, saved: amount, remaining: Math.max(goal.monthlyAmount - amount, 0), status };
    });
}

export function monthlySeries(totals: MonthGoalTotal[], months: MonthKey[]): { month: MonthKey; amount: number; percent: number }[] {
  const byMonth = new Map<MonthKey, number>();
  for (const total of totals) addTo(byMonth, total.month, total.amount);

  const amounts = months.map((month) => ({ month, amount: byMonth.get(month) ?? 0 }));
  const max = Math.max(0, ...amounts.map((a) => a.amount));
  return amounts.map(({ month, amount }) => ({
    month,
    amount,
    percent: amount > 0 ? Math.max(MIN_VISIBLE_PERCENT, Math.round((amount / max) * 100)) : 0,
  }));
}

export function goalTotals(goals: GoalLike[], totals: MonthGoalTotal[]): GoalTotal[] {
  const byGoal = new Map<number, number>();
  const deleted = new Map<string, number>();
  let temporary = 0;
  for (const total of totals) {
    if (total.goalId !== null) addTo(byGoal, total.goalId, total.amount);
    else if (total.goalName !== null) addTo(deleted, total.goalName, total.amount);
    else temporary += total.amount;
  }

  return [
    ...goals.map((g): GoalTotal => ({ key: `goal:${g.id}`, label: g.name, tag: g.active ? null : "已停用", amount: byGoal.get(g.id) ?? 0 })),
    ...[...deleted]
      .sort(([a], [b]) => a.localeCompare(b, "zh-TW"))
      .map(([name, amount]): GoalTotal => ({ key: `deleted:${name}`, label: name, tag: "已刪除", amount })),
    ...(temporary > 0 ? [{ key: "temporary", label: TEMPORARY_LABEL, tag: null, amount: temporary }] : []),
  ];
}

export function entryLabel(entry: { goalId: number | null; goalName: string | null }): { label: string; tag: "已刪除" | null } {
  if (entry.goalName === null) return { label: TEMPORARY_LABEL, tag: null };
  return { label: entry.goalName, tag: entry.goalId === null ? "已刪除" : null };
}

/** 可能超過 100（多存了），畫進度條時再自行封頂 */
export function percentOf(part: number, whole: number): number | null {
  return whole > 0 ? Math.round((part / whole) * 100) : null;
}

export function earliestMonth(totals: MonthGoalTotal[]): MonthKey | null {
  return totals.reduce<MonthKey | null>((earliest, t) => (earliest === null || t.month < earliest ? t.month : earliest), null);
}
