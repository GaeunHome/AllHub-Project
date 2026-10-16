import type { CardBill } from "./cards";
import { daysBetween, dueStatus, type DateKey, type DueStatus } from "./dates";
import type { AccountKind, EntryKind, RecurringMode } from "./kinds";
import type { MonthKey } from "./month";
import { pendingOccurrences, recurringTitle, type RecurringLike } from "./recurring";

// 總覽的待處理 要確認的固定收支與信用卡帳單 自動記的不列

export type PendingStatus = DueStatus;

/** daysLeft 是離 date 幾天 逾期是負的 amount 是預計金額或本期應繳 */
type PendingBase = { key: string; date: DateKey; status: PendingStatus; daysLeft: number; name: string; amount: number };

/**
 * 每條規則只列最舊的一期 要照順序處理
 * laterCount 是之後還有幾期也到了或 7 天內會到
 */
export type PendingRecurring = PendingBase & {
  type: "recurring";
  ruleId: number;
  period: MonthKey;
  kind: EntryKind;
  accountId: number;
  counterAccountId: number | null;
  categoryId: number | null;
  holdingId: number | null;
  allocate: boolean;
  laterCount: number;
};

/** date 是截止日 還沒填帳單時 amount 是估計 填了是本期還要繳的 */
export type PendingCard = PendingBase & {
  type: "card";
  accountId: number;
  payFromAccountId: number | null;
  autopay: boolean;
  statementDate: DateKey | null;
  needsBill: boolean;
  estimate: number;
  billId: number | null;
};

export type PendingItem = PendingRecurring | PendingCard;

/** 固定收支的資料表列有這些欄位就夠 */
export type PendingRuleRow = RecurringLike & {
  id: number;
  kind: EntryKind;
  amount: number;
  mode: RecurringMode;
  active: boolean;
  accountId: number;
  counterAccountId: number | null;
  categoryId: number | null;
  holdingId: number | null;
  allocate: boolean;
  name: string | null;
  note: string | null;
};

/** 登入者自己的帳戶 分類與持股 名稱與停用狀態從這裡找 */
export type PendingContext = {
  accounts: { id: number; name: string; kind: AccountKind; active: boolean; payFromAccountId: number | null; autopay: boolean }[];
  categories: { id: number; name: string }[];
  holdings: { id: number; symbol: string }[];
};

/**
 * 規則與用到的帳戶都要啟用中 停用的不會到期也不能確認
 * 同一天信用卡在前 截止日比固定收支的日期更不能錯過
 */
export function pendingItems(rules: PendingRuleRow[], bills: CardBill[], today: DateKey, context: PendingContext): PendingItem[] {
  const accounts = new Map(context.accounts.map((account) => [account.id, account]));
  const names = {
    accounts: new Map(context.accounts.map((account) => [account.id, account.name])),
    categories: new Map(context.categories.map((category) => [category.id, category.name])),
    holdingSymbols: new Map(context.holdings.map((holding) => [holding.id, holding.symbol])),
  };
  const usable = (id: number | null) => id === null || accounts.get(id)?.active === true;

  const recurring = rules.flatMap((rule): PendingRecurring[] => {
    if (rule.mode !== "confirm" || !rule.active || !usable(rule.accountId) || !usable(rule.counterAccountId)) return [];
    const [oldest, ...later] = pendingOccurrences(rule, today);
    if (oldest === undefined) return [];
    return [
      {
        type: "recurring",
        key: `recurring:${rule.id}:${oldest.period}`,
        date: oldest.date,
        status: dueStatus(oldest.date, today),
        daysLeft: daysBetween(today, oldest.date),
        name: recurringTitle(rule, names),
        amount: rule.amount,
        ruleId: rule.id,
        period: oldest.period,
        kind: rule.kind,
        accountId: rule.accountId,
        counterAccountId: rule.counterAccountId,
        categoryId: rule.categoryId,
        holdingId: rule.holdingId,
        allocate: rule.allocate,
        laterCount: later.length,
      },
    ];
  });

  const cards = bills.flatMap((bill): PendingCard[] => {
    const account = accounts.get(bill.accountId);
    if (!account?.active || account.kind !== "credit" || bill.status === "none" || bill.dueDate === null) return [];
    return [
      {
        type: "card",
        key: `card:${bill.accountId}:${bill.dueDate}`,
        date: bill.dueDate,
        status: dueStatus(bill.dueDate, today),
        daysLeft: daysBetween(today, bill.dueDate),
        name: account.name,
        amount: bill.needsBill ? bill.estimate : bill.remainingDue,
        accountId: account.id,
        payFromAccountId: account.payFromAccountId,
        autopay: account.autopay,
        statementDate: bill.statementDate,
        needsBill: bill.needsBill,
        estimate: bill.estimate,
        billId: bill.billId,
      },
    ];
  });

  const order = (item: PendingItem) => (item.type === "card" ? 0 : 1);
  const id = (item: PendingItem) => (item.type === "card" ? item.accountId : item.ruleId);
  return [...cards, ...recurring].sort((a, b) => a.date.localeCompare(b.date) || order(a) - order(b) || id(a) - id(b));
}
