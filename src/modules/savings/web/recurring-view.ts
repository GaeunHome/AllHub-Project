import type { UiIconName } from "@/core/ui/icon";
import { dueText, formatSlashDate, type DateKey, type DueStatus } from "../lib/dates";
import { accountsWithHoldings, type HoldingLike } from "../lib/holdings";
import { DEFAULT_CATEGORY_ICON, INTERVAL_LABELS, categoryIconOf, type EntryKind, type IntervalMonths, type RecurringMode } from "../lib/kinds";
import { bySortOrder, suggestAllocation, type AccountBalance, type AccountLike, type AllocationReason, type CategoryLike } from "../lib/ledger";
import type { MonthKey } from "../lib/month";
import { pendingItems, type PendingRecurring, type PendingRuleRow } from "../lib/pending";
import type { Quote } from "../lib/quotes";
import { firstPeriod, nextRunDate, recurringTitle, scheduleText } from "../lib/recurring";
import type { AccountChoice, CategoryOption, HoldingOption, RecurringDraft, SalaryAccountOption } from "./components/forms/options";
import { categoryOptions, formExtras, pendingEntries, salaryAccountOptions, type ConfirmDraft, type SalaryPrefill } from "./dashboard-view";
import { sortByNextDate } from "./settings-display";

// 每月固定頁與投資頁的定期定額 伺服器整理好畫面要的形狀

/** 這一期到了或 7 天內會到 跟總覽的這個月要做的事是同一期 */
export type DueView = {
  period: MonthKey;
  date: DateKey;
  status: DueStatus;
  daysLeft: number;
  /** 之後還有幾期也到了 要照順序處理 */
  laterCount: number;
  confirm: ConfirmDraft | null;
  salary: SalaryPrefill | null;
};

export type RecurringRowView = {
  id: number;
  title: string;
  /** 例如 每月 10 日 遇假日寫在括號裡 */
  when: string;
  /** 加上記帳方式 例如 每月 20 日 · 遇假日延後 · 到期請我確認 */
  schedule: string;
  kind: EntryKind;
  amount: number;
  mode: RecurringMode;
  icon: UiIconName;
  /** 停用的規則 或用到的帳戶停用了 都不會記帳 */
  paused: "rule" | "account" | null;
  /** 停用時是 null */
  nextDate: DateKey | null;
  due: DueView | null;
  /** 修改視窗帶入的原本內容 */
  draft: RecurringDraft;
};

/** 照每月規劃分 有目標的分到目標為止 */
export type AllocationLineView = { accountId: number; name: string; plan: number; target: number | null; suggested: number; reason: AllocationReason };

export type SalaryView = RecurringRowView & {
  receivingName: string;
  allocation: AllocationLineView[];
  /** 照預計金額分完後留在入帳帳戶的 */
  remainder: number;
};

export type RegularBuyView = RecurringRowView & { symbol: string | null; holdingName: string | null; fromName: string };

/** 修改分配視窗的一列 balance 是現在的餘額 */
export type AllocationAccount = { id: number; name: string; balance: number; monthlyPlan: number | null; targetAmount: number | null };

export type RecurringFormOptions = { accounts: AccountChoice[]; categories: CategoryOption[]; holdings: HoldingOption[]; today: DateKey };

export type RecurringPageView = {
  salaries: SalaryView[];
  regularBuys: RegularBuyView[];
  others: RecurringRowView[];
  form: RecurringFormOptions;
  /** 入帳並分配的入帳與轉入帳戶 */
  salaryAccounts: SalaryAccountOption[];
  /** 修改分配能改的帳戶 不含有持股的投資帳戶 */
  allocationAccounts: AllocationAccount[];
};

export type RecurringSources = {
  accounts: AccountLike[];
  rules: PendingRuleRow[];
  categories: (CategoryLike & { icon: string | null })[];
  holdings: HoldingLike[];
  /** 定期定額確認時估股數用 沒有持股或讀不到是 null */
  quotes: readonly Quote[] | null;
  balances: Map<number, AccountBalance>;
  today: DateKey;
};

const intervalLabel = (interval: number) => INTERVAL_LABELS[interval as IntervalMonths] ?? `每 ${interval} 個月`;

/** 每年的寫出月份 遇假日寫在括號裡 */
export function whenText(rule: Pick<PendingRuleRow, "dayOfMonth" | "intervalMonths" | "startMonth" | "holidayRule" | "createdAt">): string {
  const day = rule.intervalMonths === 12 ? `每年 ${Number(firstPeriod(rule).slice(5, 7))} 月 ${rule.dayOfMonth} 日` : `${intervalLabel(rule.intervalMonths)} ${rule.dayOfMonth} 日`;
  if (rule.holidayRule === "before") return `${day}（遇假日提前）`;
  if (rule.holidayRule === "after") return `${day}（遇假日延後）`;
  return day;
}

const toDraft = (rule: PendingRuleRow): RecurringDraft => ({
  id: rule.id,
  kind: rule.kind,
  accountId: rule.accountId,
  counterAccountId: rule.counterAccountId,
  categoryId: rule.categoryId,
  amount: rule.amount,
  note: rule.note,
  name: rule.name,
  dayOfMonth: rule.dayOfMonth,
  intervalMonths: rule.intervalMonths,
  startMonth: rule.startMonth,
  holidayRule: rule.holidayRule,
  mode: rule.mode,
  holdingId: rule.holdingId,
  allocate: rule.allocate,
  active: rule.active,
  lastPostedMonth: rule.lastPostedMonth,
  createdAt: rule.createdAt.toISOString(),
});

/** 跟總覽同一套 到了或 7 天內會到的最舊那一期 規則或帳戶停用的不列 */
function dueViews({ accounts, rules, categories, holdings, quotes, today }: RecurringSources): Map<number, DueView> {
  const context = { accounts: accounts.map((account) => ({ ...account, autopay: false })), categories, holdings };
  const items = pendingItems(rules, [], today, context).filter((item): item is PendingRecurring => item.type === "recurring");
  const entries = pendingEntries(items, { accounts, rules, holdings, quotes, categories, fills: new Map(), today });
  return new Map(
    items.map((item): [number, DueView] => {
      const entry = entries.find((candidate) => candidate.rule?.ruleId === item.ruleId);
      const status = item.status === "needs-bill" ? "upcoming" : item.status;
      return [item.ruleId, { period: item.period, date: item.date, status, daysLeft: item.daysLeft, laterCount: item.laterCount, confirm: entry?.confirm ?? null, salary: entry?.salary ?? null }];
    }),
  );
}

/** 薪水與定期定額各有一區 其他的照下一期排在最後一區 */
export function recurringPageView(sources: RecurringSources): RecurringPageView {
  const { accounts, rules, categories, holdings, balances, today } = sources;
  const accountById = new Map(accounts.map((account) => [account.id, account]));
  const categoryById = new Map(categories.map((category) => [category.id, category]));
  const holdingById = new Map(holdings.map((holding) => [holding.id, holding]));
  const withHoldings = accountsWithHoldings(holdings);
  const names = {
    accounts: new Map(accounts.map((account) => [account.id, account.name])),
    categories: new Map(categories.map((category) => [category.id, category.name])),
    holdingSymbols: new Map(holdings.map((holding) => [holding.id, holding.symbol])),
  };
  const due = dueViews(sources);

  const pausedOf = (rule: PendingRuleRow): RecurringRowView["paused"] => {
    if (!rule.active) return "rule";
    const used = [rule.accountId, rule.counterAccountId].filter((id): id is number => id !== null);
    return used.some((id) => accountById.get(id)?.active === false) ? "account" : null;
  };
  const iconOf = (rule: PendingRuleRow): UiIconName => {
    if (rule.holdingId !== null) return "chart-line";
    if (rule.kind === "transfer") return "arrow-left-right";
    const category = rule.categoryId === null ? undefined : categoryById.get(rule.categoryId);
    return category ? categoryIconOf(category.icon, rule.kind) : DEFAULT_CATEGORY_ICON[rule.kind];
  };
  const rowOf = (rule: PendingRuleRow): RecurringRowView => {
    const paused = pausedOf(rule);
    return {
      id: rule.id,
      title: recurringTitle(rule, names),
      when: whenText(rule),
      schedule: scheduleText(rule),
      kind: rule.kind,
      amount: rule.amount,
      mode: rule.mode,
      icon: iconOf(rule),
      paused,
      nextDate: paused === null ? nextRunDate(rule, today) : null,
      due: due.get(rule.id) ?? null,
      draft: toDraft(rule),
    };
  };
  // 照下一期的日期排 停用的排在最後
  const ordered = (list: PendingRuleRow[]) =>
    sortByNextDate(
      list.map((rule) => {
        const row = rowOf(rule);
        return { id: rule.id, active: rule.active, accountPaused: row.paused === "account", nextDate: row.nextDate, rule, row };
      }),
    );

  const isSalary = (rule: PendingRuleRow) => rule.allocate && rule.kind === "income";
  const isRegular = (rule: PendingRuleRow) => rule.holdingId !== null;

  const salaries = ordered(rules.filter(isSalary)).map(({ rule, row }): SalaryView => {
    const plan = suggestAllocation(accounts, balances, rule.accountId, rule.amount, withHoldings);
    return {
      ...row,
      receivingName: names.accounts.get(rule.accountId) ?? "",
      allocation: plan.lines.map((line) => {
        const account = accountById.get(line.accountId);
        return { ...line, name: account?.name ?? "", plan: account?.monthlyPlan ?? 0, target: account?.targetAmount ?? null };
      }),
      remainder: plan.remainder,
    };
  });

  const regularBuys = ordered(rules.filter(isRegular)).map(({ rule, row }): RegularBuyView => {
    const holding = rule.holdingId === null ? undefined : holdingById.get(rule.holdingId);
    return { ...row, symbol: holding?.symbol ?? null, holdingName: holding?.name ?? null, fromName: names.accounts.get(rule.accountId) ?? "" };
  });

  const active = accounts.filter((account) => account.active).sort(bySortOrder);
  const receivers = active.filter((account) => !withHoldings.has(account.id));
  return {
    salaries,
    regularBuys,
    others: ordered(rules.filter((rule) => !isSalary(rule) && !isRegular(rule))).map(({ row }) => row),
    form: recurringFormOptions(accounts, categories, holdings, today),
    salaryAccounts: salaryAccountOptions(accounts, balances, withHoldings),
    allocationAccounts: receivers
      .filter((account) => account.kind !== "credit")
      .map((account) => ({ id: account.id, name: account.name, balance: balances.get(account.id)?.balance ?? 0, monthlyPlan: account.monthlyPlan, targetAmount: account.targetAmount })),
  };
}

/**
 * 固定收支表單的選項 含停用的帳戶 修改時才選得到原本的
 * 停用的投資帳戶裡的持股只在修改原本選它的定期定額時列出來
 */
function recurringFormOptions(accounts: AccountLike[], categories: RecurringSources["categories"], holdings: HoldingLike[], today: DateKey): RecurringFormOptions {
  const withHoldings = accountsWithHoldings(holdings);
  const accountById = new Map(accounts.map((account) => [account.id, account]));
  return {
    accounts: [...accounts]
      .sort(bySortOrder)
      .map((account) => ({ id: account.id, name: account.name, kind: account.kind, active: account.active, ...formExtras(account), withHoldings: withHoldings.has(account.id) })),
    categories: categoryOptions(categories),
    holdings: [...holdings]
      .sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id)
      .flatMap((holding) => {
        const account = accountById.get(holding.accountId);
        return account?.kind === "investment" ? [{ id: holding.id, symbol: holding.symbol, name: holding.name, accountId: holding.accountId, accountName: account.name, active: account.active }] : [];
      }),
    today,
  };
}

/**
 * 列上名稱下面那一行 要處理的那一期寫日期與還有幾天 逾期改用標籤不在這裡重複
 * 停用的不寫下一期 extra 是排程後面多寫的 例如從哪個帳戶扣
 */
export function recurringDetail(row: Pick<RecurringRowView, "nextDate" | "due" | "paused">, schedule: string, extra: string[] = []): string {
  const parts = [schedule, ...extra];
  if (row.paused !== null) return parts.join(" · ");
  if (row.due) {
    parts.push(row.due.status === "overdue" ? formatSlashDate(row.due.date) : `${formatSlashDate(row.due.date)} ${row.due.status === "today" ? "今天到期" : `到期 · ${dueText(row.due.daysLeft)}`}`);
    if (row.due.laterCount > 0) parts.push(`還有 ${row.due.laterCount} 期`);
  } else if (row.nextDate !== null) {
    parts.push(`下一期 ${formatSlashDate(row.nextDate)}`);
  }
  return parts.join(" · ");
}
