import { UNCATEGORIZED_KEY, budgetRows, expenseSlices, type CategoryLike, type CategoryMonthTotal } from "../lib/ledger";
import type { MonthKey } from "../lib/month";
import { recordsHref } from "./paths";

/**
 * 本月支出的一列 長條只畫有預算的 意思是已用 / 預算
 * category 是紀錄頁篩選用的值 分類 id 或未分類
 */
export type ExpenseRow = { key: string; name: string; spent: number; budget: number | null; barPercent: number | null; over: number; category: string; href: string };

/**
 * 照金額由大到小 有設預算但還沒花的排在最後
 * 沒分類或分類已刪除的併成未分類 點了到紀錄頁篩好那個分類
 */
export function expenseRows(categories: CategoryLike[], totals: CategoryMonthTotal[], month: MonthKey): ExpenseRow[] {
  const budgets = new Map(budgetRows(categories, totals, month).map((row) => [row.categoryId, row]));
  const row = (key: string, name: string, spent: number, categoryId: number | null): ExpenseRow => {
    const budget = categoryId === null ? undefined : budgets.get(categoryId);
    const category = categoryId === null ? UNCATEGORIZED_KEY : String(categoryId);
    return {
      key,
      name,
      spent,
      budget: budget?.budget ?? null,
      barPercent: budget ? Math.min(100, budget.percent) : null,
      over: budget ? Math.max(0, spent - budget.budget) : 0,
      category,
      href: recordsHref({ category: categoryId ?? UNCATEGORIZED_KEY }),
    };
  };
  const spent = expenseSlices(categories, totals, month).map((slice) => row(slice.key, slice.label, slice.amount, slice.key === UNCATEGORIZED_KEY ? null : Number(slice.key.replace(/^category:/, ""))));
  const unspent = [...budgets.values()].filter((budget) => budget.spent === 0).map((budget) => row(`category:${budget.categoryId}`, budget.name, 0, budget.categoryId));
  return [...spent, ...unspent];
}
