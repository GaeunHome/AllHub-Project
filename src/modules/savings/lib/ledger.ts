import { taipeiToday, type DateKey } from "./dates";
import { SELECTABLE_COLORS, type AccountKind, type CategoryKind, type PaletteColor } from "./kinds";
import { addMonths, dateToMonth, recentMonths, type MonthKey } from "./month";
import { scheduledDate } from "./recurring";

// 頁面與表單共用同一套計算 資料庫只給每個帳戶與分類每月的合計

/**
 * 每個帳戶每月的流量 金額都是正數 只有調整帶正負號
 * 轉帳的轉出算在 account_id 轉入算在 counter_account_id
 */
export type AccountMonthFlow = { accountId: number; month: MonthKey; income: number; expense: number; transferIn: number; transferOut: number; adjust: number };

/** 每個分類每月的合計 只有收入與支出 categoryId 是 null 是未分類 */
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
  dueDay: number | null;
  payFromAccountId: number | null;
  active: boolean;
  sortOrder: number;
  createdAt: Date;
};
export type PurposeLike = { id: number; name: string; color: PaletteColor };
export type CategoryLike = { id: number; name: string; kind: CategoryKind; color: PaletteColor; monthlyBudget: number | null };

/**
 * cost 與 profit 只有投資帳戶有 是淨投入與賺賠
 * owed 只有信用卡有 是未繳 不會是負的
 */
export type AccountBalance = { balance: number; cost: number | null; profit: number | null; owed: number | null };

/** percent 是 0 到 100 到小數一位 同一張圖各片合計剛好 100 */
export type Slice = { key: string; label: string; color: PaletteColor; amount: number; percent: number };

export type AssetGrouping = "purpose" | "account";

/** 本月用 active 只算啟用中的 過去的月份用 all 那時錢還在 停用的也算 */
export type AssetScope = "active" | "all";

export type MonthTotals = { income: number; expense: number; saved: number };

/** 資產是存款加投資的餘額合計 owed 是信用卡未繳合計 */
export type AssetSummary = { assets: number; owed: number; investmentProfit: number };

/** 餘額是負的存款或投資帳戶 圓餅圖只畫正的 這些另外寫出來 */
export type NegativeAccount = { accountId: number; name: string; balance: number };

export type BudgetStatus = "ok" | "warning" | "over";
export type BudgetRow = { categoryId: number; name: string; color: PaletteColor; budget: number; spent: number; remaining: number; percent: number; status: BudgetStatus };

export type TrendPoint = { month: MonthKey; income: number; expense: number; assets: number };

export type TargetProgress = { target: number; balance: number; remaining: number; percent: number; reached: boolean };

/**
 * payFromRemaining 是扣款帳戶繳完所有從它扣的卡費後還剩多少
 * short 是不夠扣
 */
export type CardStatus = {
  accountId: number;
  owed: number;
  dueDay: number | null;
  nextDueDate: DateKey | null;
  payFromAccountId: number | null;
  payFromRemaining: number | null;
  short: boolean;
};

/** 發薪分配只用這些欄位 瀏覽器的選項不必湊齊整個帳戶 */
export type AllocationAccount = Pick<AccountLike, "id" | "kind" | "active" | "monthlyPlan" | "targetAmount" | "sortOrder">;

export type AllocationReason = "plan" | "target-capped" | "target-reached";
export type AllocationLine = { accountId: number; suggested: number; reason: AllocationReason };
/** 分出去的超過薪水時 remainder 是負的 畫面要提醒 伺服器會擋 */
export type AllocationPlan = { lines: AllocationLine[]; remainder: number };

const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);

/**
 * 四捨五入到小數一位 整數先乘再除才準
 * 先除的話 0.57 乘 1000 會變成 569.99 多
 */
export function roundedPercent(part: number, whole: number): number {
  return Math.round((part * 1000) / whole) / 10;
}

// 進度無條件捨去 還沒到 80% 或目標時才不會進位顯示成 80% 或 100%
const flooredPercent = (part: number, whole: number) => Math.floor((part * 1000) / whole) / 10;

/**
 * 各片用最大餘數法分配 合計剛好 100
 * 各自四捨五入的話三等分是 99.9 六等分是 100.2
 */
function sharePercents(amounts: number[]): number[] {
  const whole = sum(amounts);
  // 以 0.1% 為單位做整數運算 不經過浮點數
  const tenths = amounts.map((amount) => ({ floor: Math.floor((amount * 1000) / whole), remainder: (amount * 1000) % whole }));
  const left = 1000 - sum(tenths.map((share) => share.floor));
  // 餘數一樣時給前面的 也就是圖上比較大或排前面的那片
  const extra = new Set(
    tenths
      .map((share, i) => ({ i, remainder: share.remainder }))
      .sort((a, b) => b.remainder - a.remainder || a.i - b.i)
      .slice(0, left)
      .map((share) => share.i),
  );
  return tenths.map((share, i) => (share.floor + (extra.has(i) ? 1 : 0)) / 10);
}

function withPercents(slices: Omit<Slice, "percent">[]): Slice[] {
  const percents = sharePercents(slices.map((slice) => slice.amount));
  return slices.map((slice, i) => ({ ...slice, percent: percents[i] }));
}

/** 設定頁的順序 傳進來的順序不可靠時也照這個排 例如頁面自己篩選過 */
export function bySortOrder(a: { sortOrder: number; id: number }, b: { sortOrder: number; id: number }): number {
  return a.sortOrder - b.sortOrder || a.id - b.id;
}

/** 點支出圓餅圖未分類那片時 紀錄頁也用同一個 key 篩選 */
export const UNCATEGORIZED_KEY = "uncategorized";

export function expenseSliceKey(categoryId: number | null): string {
  return categoryId === null ? UNCATEGORIZED_KEY : `category:${categoryId}`;
}

const UNCATEGORIZED = { label: "未分類", color: "slate" } as const;
const NO_PURPOSE = { key: "purpose:none", label: "未設定用途", color: "slate" } as const;

/**
 * 銀行 App 上的數字 信用卡是未繳 負的是溢繳 其他就是餘額
 * 寫成 -balance 的話 0 會變成 -0
 */
export function shownFigure(kind: AccountKind, balance: number): number {
  return kind === "credit" ? 0 - balance : balance;
}

/** shownFigure 反過來 把輸入的數字換回帳上的餘額 */
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

const startMonthOf = (account: Pick<AccountLike, "createdAt">) => dateToMonth(accountStartDate(account));

/** 還沒開始記帳的月份帳戶還不存在 餘額 成本 未繳都是 0 */
function notStarted(kind: AccountKind): AccountBalance {
  const investment = kind === "investment";
  return { balance: 0, cost: investment ? 0 : null, profit: investment ? 0 : null, owed: kind === "credit" ? 0 : null };
}

/** 到 through 月底為止的餘額 省略是全部紀錄 開始記帳的月份之前一律是 0 */
export function accountBalances(accounts: AccountLike[], flows: AccountMonthFlow[], through?: MonthKey): Map<number, AccountBalance> {
  const totals = new Map<number, FlowTotals>();
  for (const flow of flows) {
    if (through !== undefined && flow.month > through) continue;
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
      // 早於開始記帳那天的舊資料併到開始的月份
      // 過去的月份才不會只扣錢沒有起始餘額而變成負的
      if (through !== undefined && startMonthOf(account) > through) return [account.id, notStarted(account.kind)];
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

export function assetSummary(accounts: AccountLike[], balances: Map<number, AccountBalance>, scope: AssetScope = "active"): AssetSummary {
  const summary: AssetSummary = { assets: 0, owed: 0, investmentProfit: 0 };
  for (const account of accounts) {
    if (!inScope(account, scope)) continue;
    const balance = balances.get(account.id);
    if (account.kind === "credit") {
      summary.owed += owedOf(balance);
      continue;
    }
    summary.assets += balance?.balance ?? 0;
    if (account.kind === "investment") summary.investmentProfit += balance?.profit ?? 0;
  }
  return summary;
}

export function monthTotals(totals: CategoryMonthTotal[], month: MonthKey): MonthTotals {
  const ofKind = (kind: CategoryKind) => sum(totals.filter((t) => t.month === month && t.kind === kind).map((t) => t.amount));
  const income = ofKind("income");
  const expense = ofKind("expense");
  return { income, expense, saved: income - expense };
}

/** 由大到小 null 或找不到的分類併成灰色的未分類 */
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
  return withPercents(
    entries.map(([key, amount]) => {
      const category = key === null ? undefined : known.get(key);
      return { key: expenseSliceKey(key), ...(category ? { label: category.name, color: category.color } : UNCATEGORIZED), amount };
    }),
  );
}

/**
 * 依帳戶分組時先輪用途沒用到的顏色 切換分組時比較不會跟用途同色
 * 灰色留給未設定用途 不輪
 */
function accountColors(purposes: PurposeLike[]): PaletteColor[] {
  const used = new Set<PaletteColor>(purposes.map((purpose) => purpose.color));
  return [...SELECTABLE_COLORS.filter((color) => !used.has(color)), ...SELECTABLE_COLORS.filter((color) => used.has(color))];
}

/**
 * 只算餘額大於 0 的存款與投資帳戶 預設只有啟用中的
 * 依用途時沒設定的是灰色的未設定用途 依帳戶時顏色照 accountColors 輪替
 */
export function assetSlices(by: AssetGrouping, accounts: AccountLike[], purposes: PurposeLike[], balances: Map<number, AccountBalance>, scope: AssetScope = "active"): Slice[] {
  const holdings = accounts
    .filter((account) => inScope(account, scope) && account.kind !== "credit")
    .sort(bySortOrder)
    .map((account) => ({ account, amount: balances.get(account.id)?.balance ?? 0 }))
    .filter(({ amount }) => amount > 0);

  if (by === "account") {
    const colors = accountColors(purposes);
    return withPercents(holdings.map(({ account, amount }, i) => ({ key: `account:${account.id}`, label: account.name, color: colors[i % colors.length], amount })));
  }

  // 跟設定頁的用途同一個順序 金額變動時各片的位置才不會跳來跳去
  const known = new Map(purposes.map((purpose) => [purpose.id, purpose]));
  const amounts = new Map<number | null, number>();
  for (const { account, amount } of holdings) {
    const key = account.purposeId !== null && known.has(account.purposeId) ? account.purposeId : null;
    amounts.set(key, (amounts.get(key) ?? 0) + amount);
  }
  const slices = purposes.flatMap((purpose) => {
    const amount = amounts.get(purpose.id);
    return amount ? [{ key: `purpose:${purpose.id}`, label: purpose.name, color: purpose.color, amount }] : [];
  });
  const unassigned = amounts.get(null);
  return withPercents(unassigned ? [...slices, { ...NO_PURPOSE, amount: unassigned }] : slices);
}

/** 餘額小於 0 的存款與投資帳戶 預設只有啟用中的 信用卡的欠款另外算在未繳 */
export function negativeAccounts(accounts: AccountLike[], balances: Map<number, AccountBalance>, scope: AssetScope = "active"): NegativeAccount[] {
  return accounts
    .filter((account) => inScope(account, scope) && account.kind !== "credit")
    .sort(bySortOrder)
    .flatMap((account) => {
      const balance = balances.get(account.id)?.balance ?? 0;
      return balance < 0 ? [{ accountId: account.id, name: account.name, balance }] : [];
    });
}

/** 有設預算的支出分類 花到 80% 是 warning 超過預算是 over */
export function budgetRows(categories: CategoryLike[], totals: CategoryMonthTotal[], month: MonthKey): BudgetRow[] {
  return categories.flatMap((category) => {
    const budget = category.monthlyBudget;
    if (category.kind !== "expense" || budget === null) return [];
    const spent = sum(totals.filter((t) => t.kind === "expense" && t.month === month && t.categoryId === category.id).map((t) => t.amount));
    // 用整數比較 80% 不經過浮點數
    const status: BudgetStatus = spent > budget ? "over" : spent * 10 >= budget * 8 ? "warning" : "ok";
    return [{ categoryId: category.id, name: category.name, color: category.color, budget, spent, remaining: budget - spent, percent: flooredPercent(spent, budget), status }];
  });
}

/**
 * 到 end 為止最多 count 個月 從帳戶建立或第一筆紀錄的月份開始
 * assets 是月底的資產 current 之前停用的也算 之後只算啟用中的
 */
export function trendSeries(accounts: AccountLike[], flows: AccountMonthFlow[], totals: CategoryMonthTotal[], end: MonthKey, count = 12, current: MonthKey = end): TrendPoint[] {
  const starts = [...accounts.map(startMonthOf), ...flows.map((flow) => flow.month), ...totals.map((total) => total.month)];
  if (starts.length === 0) return [];
  const earliest = starts.reduce((a, b) => (b < a ? b : a));
  return recentMonths(end, count)
    .filter((month) => month >= earliest)
    .map((month) => {
      const { income, expense } = monthTotals(totals, month);
      // 停用只代表現在不用了 拿今天的狀態算過去的月份的話
      // 錢轉走後才停用的帳戶會讓資產看起來突然多了一筆
      const assets = assetSummary(accounts, accountBalances(accounts, flows, month), month < current ? "all" : "active").assets;
      return { month, income, expense, assets };
    });
}

export function targetProgress(target: number | null, balance: number): TargetProgress | null {
  if (target === null) return null;
  const reached = balance >= target;
  return { target, balance, remaining: Math.max(0, target - balance), percent: reached ? 100 : Math.max(0, flooredPercent(balance, target)), reached };
}

/** 繳款日當天也算還沒過 沒有那一天的月份是月底 */
function nextDueDate(dueDay: number, today: DateKey): DateKey {
  const month = dateToMonth(today);
  const thisMonth = scheduledDate(month, dueDay);
  return thisMonth >= today ? thisMonth : scheduledDate(addMonths(month, 1), dueDay);
}

/** 只有啟用中的信用卡 照帳戶的順序 */
export function creditCardStatuses(accounts: AccountLike[], balances: Map<number, AccountBalance>, today: DateKey): CardStatus[] {
  const cards = accounts.filter((account) => account.active && account.kind === "credit").sort(bySortOrder);
  // 同一個扣款帳戶要繳好幾張卡時 看的是全部繳完還剩多少
  const owedByPayFrom = new Map<number, number>();
  for (const card of cards) {
    if (card.payFromAccountId !== null) owedByPayFrom.set(card.payFromAccountId, (owedByPayFrom.get(card.payFromAccountId) ?? 0) + owedOf(balances.get(card.id)));
  }

  return cards.map((card) => {
    const payFrom = card.payFromAccountId === null ? undefined : balances.get(card.payFromAccountId);
    const payFromRemaining = card.payFromAccountId === null || payFrom === undefined ? null : payFrom.balance - (owedByPayFrom.get(card.payFromAccountId) ?? 0);
    return {
      accountId: card.id,
      owed: owedOf(balances.get(card.id)),
      dueDay: card.dueDay,
      nextDueDate: card.dueDay === null ? null : nextDueDate(card.dueDay, today),
      payFromAccountId: card.payFromAccountId,
      payFromRemaining,
      short: payFromRemaining !== null && payFromRemaining < 0,
    };
  });
}

/**
 * 發薪分配的建議 給有每月規劃的啟用帳戶 信用卡與入帳帳戶除外
 * 有目標的最多分到目標為止 到了就是 0
 */
export function suggestAllocation(accounts: AllocationAccount[], balances: Map<number, AccountBalance>, receivingAccountId: number, amount: number): AllocationPlan {
  const lines = accounts
    .filter((account) => account.active && account.kind !== "credit" && account.id !== receivingAccountId && account.monthlyPlan !== null)
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
