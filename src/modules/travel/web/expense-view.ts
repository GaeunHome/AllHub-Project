import { groupDigits } from "@/core/number";
import { CURRENCIES, HOME_CURRENCY, amountInput, balancesOf, isCurrency, minimalTransfers, rateInput, twdOf } from "../lib/expenses";
import type { TripExpense } from "../service/expenses";
import type { TripDetail, TripMember } from "../service/trips";

type MoneyTrip = Pick<TripDetail, "expenses" | "settlements" | "members" | "people">;

export type ExpenseDraft = { id: number; title: string; amount: string; currency: string; rate: string; paidBy: string; shares: string[] };
export type ExpenseRow = { id: number; title: string; twd: string; paid: string; split: string; draft: ExpenseDraft; people: TripMember[] };
export type TransferRow = { key: string; from: string; to: string; amount: number; text: string; money: string };
export type SettledRow = { id: number; text: string; money: string };
export type ExpenseBoard = { summary: string | null; transfers: TransferRow[]; settled: SettledRow[]; rows: ExpenseRow[]; rates: Record<string, string> };

/** 一筆最多寫三個名字 再多就寫人數 */
const NAMES_SHOWN = 3;

export const moneyText = (twd: number) => `$${groupDigits(twd)}`;

function amountText(amountCents: number, currency: string): string {
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

/** 新增時預填這趟最後用過的匯率 一趟旅程幾乎都用同一個 */
function lastRates(expenses: readonly TripExpense[]): Record<string, string> {
  return Object.fromEntries(expenses.filter(({ currency }) => currency !== HOME_CURRENCY).map(({ currency, rateMicros }) => [currency, rateInput(rateMicros)]));
}

export function expenseBoard({ expenses, settlements, members, people }: MoneyTrip, userId: string): ExpenseBoard {
  const nameOf = (id: string) => people.find((person) => person.id === id)?.name ?? "已刪除的帳號";
  const balances = balancesOf(expenses, settlements);
  const transfers = minimalTransfers(balances).map(({ from, to, amount }) => ({ key: `${from}:${to}`, from, to, amount, text: `${nameOf(from)} 給 ${nameOf(to)}`, money: moneyText(amount) }));
  return {
    summary: summaryOf(balances.get(userId) ?? 0, expenses.length > 0, transfers.length === 0),
    transfers,
    settled: settlements.map(({ id, fromUser, toUser, amountTwd }) => ({ id, text: `${nameOf(fromUser)} 給 ${nameOf(toUser)}`, money: moneyText(amountTwd) })),
    rates: lastRates(expenses),
    // 新記的在最上面 剛記完就看得到
    rows: expenses.toReversed().map((expense) => ({
      id: expense.id,
      title: expense.title,
      twd: moneyText(twdOf(expense.amountCents, expense.rateMicros)),
      paid: `${nameOf(expense.paidBy)} 付 ${amountText(expense.amountCents, expense.currency)}`,
      split: expense.shares.length > NAMES_SHOWN ? `${expense.shares.length} 人分` : `${expense.shares.map(nameOf).join("、")} 分`,
      draft: { id: expense.id, title: expense.title, amount: amountInput(expense.amountCents), currency: expense.currency, rate: rateInput(expense.rateMicros), paidBy: expense.paidBy, shares: expense.shares },
      // 已經離開的人留在舊帳上 表單裡要選得到
      people: [...members, ...people.filter(({ id }) => !members.some((member) => member.id === id) && (id === expense.paidBy || expense.shares.includes(id)))],
    })),
  };
}
