import type { CardBill } from "./cards";
import { taipeiToday, type DateKey } from "./dates";
import type { AccountKind, CategoryKind, PaletteColor } from "./kinds";
import type { MonthKey } from "./month";

// 頁面與表單共用同一套計算 資料庫只給每個帳戶與分類每月的合計

/**
 * 金額都是正數 只有調整帶正負號
 * 轉帳的轉出算在 account_id 轉入算在 counter_account_id
 */
export type AccountMonthFlow = { accountId: number; month: MonthKey; income: number; expense: number; transferIn: number; transferOut: number; adjust: number };

/** 只有收入與支出 categoryId 是 null 是未分類 */
export type CategoryMonthTotal = { categoryId: number | null; kind: CategoryKind; month: MonthKey; amount: number };

/** lib 不能 import data 所以自己定義相容的形狀 多的欄位沒關係 */
export type AccountLike = {
  id: number;
  name: string;
  kind: AccountKind;
  purposeId: number | null;
  openingBalance: number;
  openingCost: number | null;
  monthlyPlan: number | null;
  targetAmount: number | null;
  payFromAccountId: number | null;
  active: boolean;
  sortOrder: number;
  createdAt: Date;
};
export type CategoryLike = { id: number; name: string; kind: CategoryKind; color: PaletteColor; monthlyBudget: number | null };

/**
 * cost 與 profit 只有投資帳戶有 是淨投入與賺賠
 * owed 只有信用卡有 是未繳 不會是負的
 */
export type AccountBalance = { balance: number; cost: number | null; profit: number | null; owed: number | null };

/** percent 是 0 到 100 到小數一位 同一組合計剛好 100 */
export type Slice = { key: string; label: string; amount: number; percent: number };

/** 停用的帳戶現在不用了 本月用 active 不算它 */
export type AssetScope = "active" | "all";

export type MonthTotals = { income: number; expense: number; saved: number };

/** 資產是存款餘額加投資市值的合計 owed 是信用卡未繳合計 */
export type AssetSummary = { assets: number; owed: number; investmentProfit: number };

/** 有持股的投資帳戶用持股算的市值與成本 lib/holdings 的 investmentTotals 算好 */
export type InvestmentFigures = { value: number; cost: number; profit: number };

export type BudgetRow = { categoryId: number; name: string; budget: number; spent: number; percent: number };

export type TargetProgress = { target: number; balance: number; remaining: number; percent: number; reached: boolean };

/** 扣款帳戶繳完所有從它扣的卡費後還剩多少 不夠扣時 short */
export type CardStatus = { accountId: number; payFromRemaining: number | null; short: boolean };

/** 發薪分配只用這些欄位 瀏覽器的選項不必湊齊整個帳戶 */
export type AllocationAccount = Pick<AccountLike, "id" | "kind" | "active" | "monthlyPlan" | "targetAmount" | "sortOrder">;

export type AllocationReason = "plan" | "target-capped" | "target-reached";
export type AllocationLine = { accountId: number; suggested: number; reason: AllocationReason };
/** 分出去的超過薪水時 remainder 是負的 畫面要提醒 伺服器會擋 */
export type AllocationPlan = { lines: AllocationLine[]; remainder: number };

const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);

// 進度無條件捨去 還沒到預算或目標時才不會進位顯示成 100%
const flooredPercent = (part: number, whole: number) => Math.floor((part * 1000) / whole) / 10;

/**
 * 各列用最大餘數法分配 合計剛好 100
 * 各自四捨五入的話三等分是 99.9 六等分是 100.2
 */
function sharePercents(amounts: number[]): number[] {
  const whole = sum(amounts);
  // 以 0.1% 為單位做整數運算 不經過浮點數
  const tenths = amounts.map((amount) => ({ floor: Math.floor((amount * 1000) / whole), remainder: (amount * 1000) % whole }));
  const left = 1000 - sum(tenths.map((share) => share.floor));
  // 餘數一樣時給前面的 也就是金額比較大或排前面的那一列
  const extra = new Set(
    tenths
      .map((share, i) => ({ i, remainder: share.remainder }))
      .sort((a, b) => b.remainder - a.remainder || a.i - b.i)
      .slice(0, left)
      .map((share) => share.i),
  );
  return tenths.map((share, i) => (share.floor + (extra.has(i) ? 1 : 0)) / 10);
}

/** 設定頁的順序 傳進來的順序不可靠時也照這個排 例如頁面自己篩選過 */
export function bySortOrder(a: { sortOrder: number; id: number }, b: { sortOrder: number; id: number }): number {
  return a.sortOrder - b.sortOrder || a.id - b.id;
}

/** 本月支出未分類那一列連到紀錄頁時 紀錄頁用同一個 key 篩選 */
export const UNCATEGORIZED_KEY = "uncategorized";

const expenseSliceKey = (categoryId: number | null) => (categoryId === null ? UNCATEGORIZED_KEY : `category:${categoryId}`);

/**
 * 銀行 App 上的數字 信用卡是未繳 負的是溢繳 其他就是餘額
 * 寫成 -balance 的話 0 會變成 -0
 */
export function shownFigure(kind: AccountKind, balance: number): number {
  return kind === "credit" ? 0 - balance : balance;
}

/** 表單填的是銀行 App 上的數字 存起來要換回帳上的餘額 */
export function balanceFromFigure(kind: AccountKind, figure: number): number {
  return kind === "credit" ? 0 - figure : figure;
}

/** 更新餘額要記的調整 輸入的數字換成餘額後跟目前的差額 */
export function balanceAdjustment(kind: AccountKind, balance: number, figure: number): number {
  return balanceFromFigure(kind, figure) - balance;
}

const inScope = (account: AccountLike, scope: AssetScope) => scope === "all" || account.active;

type FlowTotals = Omit<AccountMonthFlow, "accountId" | "month">;
const noFlow = (): FlowTotals => ({ income: 0, expense: 0, transferIn: 0, transferOut: 0, adjust: 0 });

/**
 * 開始記帳的那天就是建立帳戶的台北日期
 * 起始餘額是那天的餘額 紀錄不能更早 表單拿它當日期的 min
 */
export function accountStartDate(account: Pick<AccountLike, "createdAt">): DateKey {
  return taipeiToday(account.createdAt);
}

/** 起始餘額加上全部紀錄 投資另外算成本 信用卡另外算未繳 */
export function accountBalances(accounts: AccountLike[], flows: AccountMonthFlow[]): Map<number, AccountBalance> {
  const totals = new Map<number, FlowTotals>();
  for (const flow of flows) {
    const total = totals.get(flow.accountId) ?? noFlow();
    total.income += flow.income;
    total.expense += flow.expense;
    total.transferIn += flow.transferIn;
    total.transferOut += flow.transferOut;
    total.adjust += flow.adjust;
    totals.set(flow.accountId, total);
  }

  return new Map(
    accounts.map((account): [number, AccountBalance] => {
      const total = totals.get(account.id) ?? noFlow();
      const balance = account.openingBalance + total.income - total.expense - total.transferOut + total.transferIn + total.adjust;
      if (account.kind === "investment") {
        const cost = (account.openingCost ?? account.openingBalance) + total.transferIn - total.transferOut;
        return [account.id, { balance, cost, profit: balance - cost, owed: null }];
      }
      return [account.id, { balance, cost: null, profit: null, owed: account.kind === "credit" ? Math.max(0, -balance) : null }];
    }),
  );
}

const owedOf = (balance: AccountBalance | undefined) => balance?.owed ?? Math.max(0, -(balance?.balance ?? 0));

/**
 * 有持股的投資帳戶用 investmentValues 的市值與賺賠 不看帳上的餘額與調整
 * 沒有持股的照舊 帳上的餘額就是更新市值時填的數字
 */
export function assetSummary(
  accounts: AccountLike[],
  balances: Map<number, AccountBalance>,
  scope: AssetScope = "active",
  investmentValues?: ReadonlyMap<number, InvestmentFigures>,
): AssetSummary {
  const summary: AssetSummary = { assets: 0, owed: 0, investmentProfit: 0 };
  for (const account of accounts) {
    if (!inScope(account, scope)) continue;
    const balance = balances.get(account.id);
    if (account.kind === "credit") {
      summary.owed += owedOf(balance);
      continue;
    }
    const held = account.kind === "investment" ? investmentValues?.get(account.id) : undefined;
    summary.assets += held?.value ?? balance?.balance ?? 0;
    if (account.kind === "investment") summary.investmentProfit += held?.profit ?? balance?.profit ?? 0;
  }
  return summary;
}

export function monthTotals(totals: CategoryMonthTotal[], month: MonthKey): MonthTotals {
  const ofKind = (kind: CategoryKind) => sum(totals.filter((t) => t.month === month && t.kind === kind).map((t) => t.amount));
  const income = ofKind("income");
  const expense = ofKind("expense");
  return { income, expense, saved: income - expense };
}

/** 由大到小 null 或找不到的分類併成一列未分類 */
export function expenseSlices(categories: CategoryLike[], totals: CategoryMonthTotal[], month: MonthKey): Slice[] {
  const expense = categories.filter((category) => category.kind === "expense");
  const known = new Map(expense.map((category) => [category.id, category]));
  const amounts = new Map<number | null, number>();
  for (const total of totals) {
    if (total.kind !== "expense" || total.month !== month) continue;
    const key = total.categoryId !== null && known.has(total.categoryId) ? total.categoryId : null;
    amounts.set(key, (amounts.get(key) ?? 0) + total.amount);
  }

  // 金額一樣時照分類的順序 未分類排最後
  const position = (key: number | null) => (key === null ? Number.POSITIVE_INFINITY : expense.findIndex((category) => category.id === key));
  const entries = [...amounts].filter(([, amount]) => amount > 0).sort(([keyA, a], [keyB, b]) => b - a || position(keyA) - position(keyB));
  const percents = sharePercents(entries.map(([, amount]) => amount));
  return entries.map(([key, amount], i) => ({ key: expenseSliceKey(key), label: (key === null ? undefined : known.get(key)?.name) ?? "未分類", amount, percent: percents[i] }));
}

/** 只有設了預算的支出分類 還沒花的也列 */
export function budgetRows(categories: CategoryLike[], totals: CategoryMonthTotal[], month: MonthKey): BudgetRow[] {
  return categories.flatMap((category) => {
    const budget = category.monthlyBudget;
    if (category.kind !== "expense" || budget === null) return [];
    const spent = sum(totals.filter((t) => t.kind === "expense" && t.month === month && t.categoryId === category.id).map((t) => t.amount));
    return [{ categoryId: category.id, name: category.name, budget, spent, percent: flooredPercent(spent, budget) }];
  });
}

export function targetProgress(target: number | null, balance: number): TargetProgress | null {
  if (target === null) return null;
  const reached = balance >= target;
  return { target, balance, remaining: Math.max(0, target - balance), percent: reached ? 100 : Math.max(0, flooredPercent(balance, target)), reached };
}

/**
 * 同一個扣款帳戶要繳好幾張卡時 看的是全部繳完還剩多少
 * 有 bills 時卡費用本期還要繳的 沒有時是目前未繳
 */
export function creditCardStatuses(accounts: AccountLike[], balances: Map<number, AccountBalance>, bills?: ReadonlyMap<number, Pick<CardBill, "remainingDue">>): CardStatus[] {
  const cards = accounts.filter((account) => account.active && account.kind === "credit").sort(bySortOrder);
  const dueOf = (card: AccountLike) => bills?.get(card.id)?.remainingDue ?? owedOf(balances.get(card.id));
  const dueByPayFrom = new Map<number, number>();
  for (const card of cards) {
    if (card.payFromAccountId !== null) dueByPayFrom.set(card.payFromAccountId, (dueByPayFrom.get(card.payFromAccountId) ?? 0) + dueOf(card));
  }

  return cards.map((card) => {
    const payFrom = card.payFromAccountId === null ? undefined : balances.get(card.payFromAccountId);
    const payFromRemaining = card.payFromAccountId === null || payFrom === undefined ? null : payFrom.balance - (dueByPayFrom.get(card.payFromAccountId) ?? 0);
    return { accountId: card.id, payFromRemaining, short: payFromRemaining !== null && payFromRemaining < 0 };
  });
}

/**
 * 有持股的投資帳戶不分配 轉進去的錢不會算進市值
 * 有目標的最多分到目標為止 到了就是 0
 */
export function suggestAllocation(
  accounts: AllocationAccount[],
  balances: Map<number, AccountBalance>,
  receivingAccountId: number,
  amount: number,
  withHoldings: ReadonlySet<number> = new Set(),
): AllocationPlan {
  const lines = accounts
    .filter((account) => account.active && account.kind !== "credit" && account.id !== receivingAccountId && account.monthlyPlan !== null && !withHoldings.has(account.id))
    .sort(bySortOrder)
    .map((account): AllocationLine => {
      const plan = account.monthlyPlan ?? 0;
      if (account.targetAmount === null) return { accountId: account.id, suggested: plan, reason: "plan" };
      const needed = account.targetAmount - (balances.get(account.id)?.balance ?? 0);
      if (needed <= 0) return { accountId: account.id, suggested: 0, reason: "target-reached" };
      return needed < plan ? { accountId: account.id, suggested: needed, reason: "target-capped" } : { accountId: account.id, suggested: plan, reason: "plan" };
    });
  return { lines, remainder: amount - sum(lines.map((line) => line.suggested)) };
}

/** 最早有紀錄的月份 月份選單用 沒有紀錄是 null */
export function earliestFlowMonth(flows: AccountMonthFlow[]): MonthKey | null {
  return flows.reduce<MonthKey | null>((earliest, flow) => (earliest === null || flow.month < earliest ? flow.month : earliest), null);
}
