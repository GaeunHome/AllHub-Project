import { groupDigits } from "@/core/number";
import { formatTaipeiShortDate } from "@/core/time";
import { CURRENCIES, EXPENSE_CATEGORIES, HOME_CURRENCY, amountInput, expenseParts, isCurrency, minimalTransfers, personTotals, rateInput, twdOf, type ExpenseCategory, type SplitMode } from "../lib/expenses";
import type { TripExpense } from "../service/expenses";
import type { TripDetail, TripMember } from "../service/trips";

// 使用者選的由上到下四段 總共與類別 每個人 誰給誰 每一筆照日期分組

type MoneyTrip = Pick<TripDetail, "title" | "startDate" | "endDate" | "expenses" | "settlements" | "members" | "people">;

/** 修改時預填的內容 paid 與 portions 的 key 是使用者 id */
export type ExpenseDraft = {
  id: number;
  title: string;
  amount: string;
  currency: string;
  rate: string;
  spentOn: string;
  category: ExpenseCategory;
  payerMode: "one" | "many";
  paidBy: string;
  paid: Record<string, string>;
  split: SplitMode;
  shares: string[];
  portions: Record<string, string>;
};
export type ExpenseRow = { id: number; title: string; category: ExpenseCategory; twd: string; paid: string; split: string; draft: ExpenseDraft; people: TripMember[] };
export type DayGroup = { key: string; label: string; rows: ExpenseRow[] };
export type CategoryTotal = { category: ExpenseCategory; label: string; money: string };
export type DetailLine = { text: string; money: string };
export type PersonRow = { id: string; name: string; paid: string; share: string; balance: string; detail: { paid: DetailLine[]; shares: DetailLine[]; repayments: DetailLine[] } };
export type TransferRow = { key: string; from: string; to: string; amount: number; text: string; money: string };
export type SettledRow = { id: number; text: string; money: string };
export type ExpenseBoard = {
  summary: string | null;
  total: string | null;
  categories: CategoryTotal[];
  people: PersonRow[];
  transfers: TransferRow[];
  settled: SettledRow[];
  days: DayGroup[];
  copyText: string | null;
};

/** 一筆最多寫三個名字 再多就寫人數 */
const NAMES_SHOWN = 3;
const BEFORE_TRIP = "before";
const NO_DATE = "none";

export const moneyText = (twd: number) => `$${groupDigits(twd)}`;

export function amountText(amountCents: number, currency: string): string {
  const cents = amountCents % 100;
  const whole = groupDigits(Math.floor(amountCents / 100));
  const shown = cents === 0 ? whole : `${whole}.${String(cents).padStart(2, "0")}`;
  return currency === HOME_CURRENCY ? `$${shown}` : `${shown} ${isCurrency(currency) ? CURRENCIES[currency] : currency}`;
}

function summaryOf(mine: number, hasExpenses: boolean, settled: boolean): string | null {
  if (!hasExpenses) return null;
  if (mine < 0) return `你要付 ${moneyText(-mine)}`;
  if (mine > 0) return `你會收到 ${moneyText(mine)}`;
  return settled ? "都結清了" : "你的帳清了";
}

const balanceText = (balance: number) => (balance > 0 ? `收 ${moneyText(balance)}` : balance < 0 ? `付 ${moneyText(-balance)}` : "清了");

function splitText({ split, shares }: TripExpense, nameOf: (id: string) => string): string {
  const many = shares.length > NAMES_SHOWN;
  const names = shares.map(({ userId }) => nameOf(userId)).join("、");
  if (split === "ratio") return many ? `照比例分給 ${shares.length} 人` : shares.map(({ userId, weight }) => `${nameOf(userId)} ${weight ?? 1} 份`).join("、");
  if (split === "amount") return `照金額分給 ${many ? `${shares.length} 人` : names}`;
  return many ? `${shares.length} 人平分` : `${names} 平分`;
}

function draftOf(expense: TripExpense): ExpenseDraft {
  const many = expense.payers.length > 1;
  return {
    id: expense.id,
    title: expense.title,
    amount: amountInput(expense.amountCents),
    currency: expense.currency,
    rate: rateInput(expense.rateMicros),
    spentOn: expense.spentOn ?? "",
    category: expense.category ?? "other",
    payerMode: many ? "many" : "one",
    paidBy: expense.paidBy,
    paid: many ? Object.fromEntries(expense.payers.map(({ userId, amountCents }) => [userId, amountInput(amountCents)])) : {},
    split: expense.split,
    shares: expense.shares.map(({ userId }) => userId),
    portions: expense.split === "even" ? {} : Object.fromEntries(expense.shares.map(({ userId, weight }) => [userId, expense.split === "amount" ? amountInput(weight ?? 0) : String(weight ?? 1)])),
  };
}

/** 新的日子在上面 出發前的併成一組 沒有日期的舊帳排最後 同一組裡新記的在上面 */
function dayKey(expense: TripExpense, startDate: string): string {
  if (expense.spentOn === null) return NO_DATE;
  return expense.spentOn < startDate ? BEFORE_TRIP : expense.spentOn;
}

const groupRank = (key: string) => (key === NO_DATE ? 2 : key === BEFORE_TRIP ? 1 : 0);

function inDisplayOrder(expenses: readonly TripExpense[], startDate: string): TripExpense[] {
  return expenses.toSorted((a, b) => {
    const [keyA, keyB] = [dayKey(a, startDate), dayKey(b, startDate)];
    return groupRank(keyA) - groupRank(keyB) || (b.spentOn ?? "").localeCompare(a.spentOn ?? "") || b.id - a.id;
  });
}

const dayLabel = (key: string) => (key === NO_DATE ? "沒有日期" : key === BEFORE_TRIP ? "出發前" : formatTaipeiShortDate(new Date(`${key}T12:00:00+08:00`)));

function categoryTotals(expenses: readonly TripExpense[]): CategoryTotal[] {
  const totals = new Map<ExpenseCategory, number>();
  for (const expense of expenses) {
    const category = expense.category ?? "other";
    totals.set(category, (totals.get(category) ?? 0) + twdOf(expense.amountCents, expense.rateMicros));
  }
  return [...totals]
    .filter(([, twd]) => twd > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([category, twd]) => ({ category, label: EXPENSE_CATEGORIES[category], money: moneyText(twd) }));
}

export function expenseBoard({ title, startDate, expenses, settlements, members, people }: MoneyTrip, userId: string): ExpenseBoard {
  const nameOf = (id: string) => people.find((person) => person.id === id)?.name ?? "已刪除的帳號";
  const totals = personTotals(expenses, settlements);
  const balances = new Map([...totals].map(([id, { balance }]) => [id, balance]));
  const transfers = minimalTransfers(balances).map(({ from, to, amount }) => ({ key: `${from}:${to}`, from, to, amount, text: `${nameOf(from)} 給 ${nameOf(to)}`, money: moneyText(amount) }));
  const ordered = inDisplayOrder(expenses, startDate);
  const parts = new Map(ordered.map((expense) => [expense.id, expenseParts(expense)]));
  const totalTwd = expenses.reduce((sum, expense) => sum + twdOf(expense.amountCents, expense.rateMicros), 0);

  const rowOf = (expense: TripExpense): ExpenseRow => ({
    id: expense.id,
    title: expense.title,
    category: expense.category ?? "other",
    twd: moneyText(twdOf(expense.amountCents, expense.rateMicros)),
    paid:
      expense.payers.length > 1
        ? expense.payers.map(({ userId, amountCents }) => `${nameOf(userId)} 付 ${amountText(amountCents, expense.currency)}`).join("、")
        : `${nameOf(expense.paidBy)} 付 ${amountText(expense.amountCents, expense.currency)}`,
    split: splitText(expense, nameOf),
    draft: draftOf(expense),
    // 已經離開的人留在舊帳上 表單裡要選得到
    people: [...members, ...people.filter(({ id }) => !members.some((member) => member.id === id) && (expense.payers.some((payer) => payer.userId === id) || expense.shares.some((share) => share.userId === id)))],
  });

  const days: DayGroup[] = [];
  for (const expense of ordered) {
    const key = dayKey(expense, startDate);
    const group = days.at(-1)?.key === key ? days.at(-1) : undefined;
    if (group) group.rows.push(rowOf(expense));
    else days.push({ key, label: dayLabel(key), rows: [rowOf(expense)] });
  }

  const linesOf = (id: string, side: "paid" | "owed") =>
    ordered.flatMap((expense) => {
      const amount = parts.get(expense.id)?.[side].get(id);
      return amount === undefined ? [] : [{ text: expense.title, money: moneyText(amount) }];
    });

  const copyLines = transfers.length > 0 ? transfers.map(({ text, money }) => `${text} ${money}`) : ["都結清了"];

  return {
    summary: summaryOf(balances.get(userId) ?? 0, expenses.length > 0, transfers.length === 0),
    total: expenses.length > 0 ? moneyText(totalTwd) : null,
    categories: categoryTotals(expenses),
    people: people.map(({ id, name }) => {
      const own = totals.get(id) ?? { paid: 0, share: 0, balance: 0 };
      return {
        id,
        name,
        paid: moneyText(own.paid),
        share: moneyText(own.share),
        balance: balanceText(own.balance),
        detail: {
          paid: linesOf(id, "paid"),
          shares: linesOf(id, "owed"),
          repayments: settlements.flatMap(({ fromUser, toUser, amountTwd }) => (fromUser === id ? [{ text: `給 ${nameOf(toUser)}`, money: moneyText(amountTwd) }] : toUser === id ? [{ text: `${nameOf(fromUser)} 給的`, money: moneyText(amountTwd) }] : [])),
        },
      };
    }),
    transfers,
    settled: settlements.map(({ id, fromUser, toUser, amountTwd }) => ({ id, text: `${nameOf(fromUser)} 給 ${nameOf(toUser)}`, money: moneyText(amountTwd) })),
    days,
    copyText: expenses.length > 0 ? [`${title} 分帳`, `這趟總共 ${moneyText(totalTwd)}`, ...copyLines].join("\n") : null,
  };
}
