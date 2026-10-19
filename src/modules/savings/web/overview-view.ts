import type { ChecklistItem, ChecklistState } from "../lib/checklist";
import { daysBetween, dueText, formatSlashDate, latestOf, type DateKey } from "../lib/dates";
import { categoryIconOf, type AccountKind, type CategoryIcon, type EntryKind } from "../lib/kinds";
import { UNCATEGORIZED_KEY, monthTotals, type CategoryLike, type CategoryMonthTotal, type MonthTotals } from "../lib/ledger";
import { formatTwd } from "../lib/money";
import type { MonthKey } from "../lib/month";
import { PENDING_LOOKAHEAD_DAYS } from "../lib/recurring";
import { setupStatus, type SetupStatus } from "../lib/setup";
import type { AccountOption, CategoryOption, EntryFormOptions } from "./components/forms/options";
import type { BalanceAccount } from "./components/forms/update-balance";
import {
  accountDetails,
  balanceAccounts,
  cardStatusView,
  categoryOptions,
  depositOptions,
  entryFormOptions,
  expenseRows,
  settlementAccounts,
  type AccountsInput,
  type AccountsState,
  type BillDraft,
  type CreditDetail,
  type ExpenseRow,
  type HoldingView,
  type PayCardDraft,
  type PendingEntry,
} from "./dashboard-view";
import { overdueBadge, plannedAmount } from "./format";
import type { ChecklistView } from "./overview-data";

// 總覽的資料 伺服器元件整理好再交給畫面

/** required 是還沒有任何帳戶 開始設定就是整個總覽 */
export type SetupView = { status: SetupStatus[]; needsCategories: boolean; required: boolean };

export function setupView(accounts: readonly { kind: AccountKind }[], rules: readonly { allocate: boolean; holdingId: number | null }[], categories: readonly unknown[]): SetupView {
  return { status: setupStatus({ accounts, rules }), needsCategories: categories.length === 0, required: accounts.length === 0 };
}

/** 沒有那種帳戶的是 null 那一段就不寫 */
export type HeroView = {
  total: number;
  deposit: number | null;
  investment: { value: number; profit: number; priced: boolean; quoteDate: DateKey | null } | null;
  cardOwed: number | null;
};

/** 只算啟用中的帳戶 合計是 accountsState 算好的 有持股的證券帳戶寫有沒有讀到股價與收盤日 */
export function heroView({ accounts }: Pick<AccountsInput, "accounts">, { summary, investments }: Pick<AccountsState, "summary" | "investments">): HeroView {
  const has = (kind: AccountKind) => accounts.some((account) => account.active && account.kind === kind);
  const held = accounts.flatMap((account) => {
    const value = account.active && account.kind === "investment" ? investments.get(account.id) : undefined;
    return value ? [value] : [];
  });

  return {
    total: summary.assets,
    deposit: has("deposit") ? summary.deposit : null,
    investment: has("investment")
      ? { value: summary.investment.value, profit: summary.investment.profit, priced: held.every((value) => value.priced), quoteDate: latestOf(held.map((value) => value.date)) }
      : null,
    cardOwed: has("credit") ? summary.owed : null,
  };
}

/** status 與 needsBill 跟帳戶頁那張卡一樣 needsBill 是先打開填帳單 */
export type CardTarget = { id: number; name: string; status: string; needsBill: boolean; bill: BillDraft; pay: PayCardDraft };

/** minDate 是證券帳戶開始記帳的那天 買賣不能更早 */
export type HoldingTarget = { holding: HoldingView; accountName: string; minDate: DateKey };

/** 信用卡照帳單繳 有持股的證券帳戶照股價算 都不能更新餘額 */
export type BalanceTarget = BalanceAccount;

/** 常用動作的按鈕打開的視窗要的東西 */
export type QuickActionsView = {
  entry: EntryFormOptions;
  cards: CardTarget[];
  holdings: HoldingTarget[];
  balances: BalanceTarget[];
  /** 繳卡費與買賣股票的扣款帳戶 */
  depositAccounts: AccountOption[];
  /** 帳單差額的分類 */
  categories: CategoryOption[];
  hasInvestmentAccount: boolean;
  today: DateKey;
};

type RuleLike = Parameters<typeof settlementAccounts>[0][number];

/** 帳戶的詳情跟帳戶頁同一套算法 帳單與繳款的預設才會一致 */
export function quickActionsView(input: AccountsInput, state: AccountsState, categories: Pick<CategoryLike, "id" | "name" | "kind">[], rules: RuleLike[]): QuickActionsView {
  const details = accountDetails(input, state, settlementAccounts(rules));
  const entry = entryFormOptions(input.accounts, categories, input.today, state.withHoldings);
  const startDates = new Map(entry.accounts.map((account) => [account.id, account.startDate ?? input.today]));
  const cardTarget = (detail: CreditDetail): CardTarget => {
    const status = cardStatusView(detail);
    return { id: detail.id, name: detail.name, status: [status.text, status.badge?.label].filter(Boolean).join(" · "), needsBill: status.action === "bill", bill: detail.bill, pay: detail.pay };
  };

  return {
    entry,
    cards: details.flatMap((detail) => (detail.kind === "credit" ? [cardTarget(detail)] : [])),
    holdings: details.flatMap((detail) =>
      detail.kind === "investment" ? detail.holdings.map((holding) => ({ holding, accountName: detail.name, minDate: startDates.get(detail.id) ?? input.today })) : [],
    ),
    balances: balanceAccounts(input.accounts, state),
    depositAccounts: depositOptions(input.accounts),
    categories: categoryOptions(categories),
    hasInvestmentAccount: details.some((detail) => detail.kind === "investment"),
    today: input.today,
  };
}

/** 這個月要做的事的一列 entry 是要處理的那一列打開的視窗內容 */
export type ChecklistRow = {
  key: string;
  title: string;
  state: ChecklistState;
  /** 日期與狀態寫成一行 */
  meta: string;
  amountText: string;
  /** 只有逾期的有標籤 */
  badge: ReturnType<typeof overdueBadge> | null;
  entry: PendingEntry | null;
};

const TO_DO: readonly ChecklistState[] = ["todo", "overdue"];

/** 還要做的 包括逾期的 */
export const isToDo = (item: Pick<ChecklistItem, "state">) => TO_DO.includes(item.state);

/** 信用卡的日期 待填帳單是結帳日 填了之後是截止日 */
function dateLabel(item: ChecklistItem): string {
  const date = formatSlashDate(item.date);
  switch (item.cardStage) {
    case "unbilled":
      return `${date} 結帳`;
    case "needs-bill":
      return `${date} 已結帳`;
    case "unpaid":
    case "paid":
      return `${date} 截止`;
    default:
      return date;
  }
}

function stateNote(item: ChecklistItem, today: DateKey): string | null {
  const finishedOn = (verb: string, fallback: string) => (item.doneOn && item.doneOn !== item.date ? `${formatSlashDate(item.doneOn)} ${verb}` : fallback);
  switch (item.state) {
    case "done":
      return item.kind === "card" ? finishedOn("繳清", "已繳清") : finishedOn("完成", "完成");
    case "auto-done":
      return "已自動記帳";
    case "skipped":
      return "已略過";
    case "auto":
      return "自動記帳";
    case "todo":
    case "overdue": {
      if (item.cardStage === "unbilled") return "結帳後填帳單";
      if (item.cardStage === "needs-bill") return "待填帳單";
      const days = daysBetween(today, item.date);
      // 7 天內就能處理 按不了是因為更早的那一期還沒處理
      if (!item.actionable && days <= PENDING_LOOKAHEAD_DAYS) return "先處理前一期";
      return item.state === "todo" && days >= 0 ? dueText(days) : null;
    }
  }
}

function amountText(item: ChecklistItem, kind: EntryKind): string {
  if (item.amount === null) return "";
  if (item.estimated) return `約 ${formatTwd(item.amount)}`;
  return plannedAmount(kind, item.amount);
}

/** 照 monthChecklist 排好的順序 收入的固定收支金額前面加加號 */
export function checklistRows(view: Pick<ChecklistView, "items" | "entries" | "today" | "incomeRules">): ChecklistRow[] {
  const entries = new Map(view.entries.map((entry) => [entry.row.key, entry]));
  return view.items.map((item) => {
    const entry = isToDo(item) && item.actionable ? (entries.get(item.key) ?? null) : null;
    const income = item.kind === "salary" || (item.ruleId !== null && view.incomeRules.has(item.ruleId));
    const note = stateNote(item, view.today);
    return {
      key: item.key,
      title: item.title,
      state: item.state,
      meta: [item.carriedOver ? "上個月" : null, dateLabel(item), note].filter((part) => part !== null).join(" · "),
      amountText: amountText(item, income ? "income" : "expense"),
      badge: item.state === "overdue" ? overdueBadge(daysBetween(view.today, item.date)) : null,
      entry,
    };
  });
}

/** 首頁卡片與總覽的標題列 還有幾件與最近要做的那一件 */
export function checklistSummary(items: readonly ChecklistItem[]): { remaining: number; next: ChecklistItem | null } {
  const toDo = items.filter(isToDo);
  return { remaining: toDo.length, next: toDo[0] ?? null };
}

/** 本月支出的一列多了分類圖示 未分類用其他的圖示 */
export type MonthExpenseRow = ExpenseRow & { icon: CategoryIcon };

export type MonthView = MonthTotals & { rows: MonthExpenseRow[] };

export function monthView(categories: (CategoryLike & { icon: string | null })[], totals: CategoryMonthTotal[], month: MonthKey): MonthView {
  const byId = new Map(categories.map((category) => [String(category.id), category]));
  const rows = expenseRows(categories, totals, month).map((row) => {
    const category = row.category === UNCATEGORIZED_KEY ? undefined : byId.get(row.category);
    return { ...row, icon: category ? categoryIconOf(category.icon, "expense") : ("circle-dot" as const) };
  });
  return { ...monthTotals(totals, month), rows };
}
