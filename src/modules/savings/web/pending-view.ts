import type { BillDefaults } from "../lib/cards";
import { MIN_DATE, latestOf, type DateKey } from "../lib/dates";
import { estimateRegularBuy, type HoldingLike } from "../lib/holdings";
import type { EntryKind } from "../lib/kinds";
import { accountStartDate, type AccountLike, type CategoryLike } from "../lib/ledger";
import type { MonthKey } from "../lib/month";
import type { PendingItem, PendingRuleRow } from "../lib/pending";
import type { Quote } from "../lib/quotes";
import { billDraft, type BillDraft, type PayCardDraft } from "./account-details";
import { confirmDate } from "./form-math";
import type { FactRow } from "./format";

// 要處理的事 每一列的按鈕與它的視窗要先填好的內容

export type PendingAction = "bill" | "pay" | "confirm" | "allocate";

/** key 跟這個月要做的事那一列的一樣 action 是那一列的按鈕 */
export type PendingRowView = { key: string; action: PendingAction };

function pendingRowView(item: PendingItem): PendingRowView {
  return { key: item.key, action: item.type === "card" ? (item.needsBill ? "bill" : "pay") : item.allocate ? "allocate" : "confirm" };
}

/** 定期定額先估好的股數與扣款 沒有報價時是 null 欄位留空 */
export type RegularBuyDraft = { symbol: string; name: string; closeCents: number | null; quoteDate: DateKey | null; estimate: { shares: number; cost: number } | null };

/** 確認固定收支視窗先填好的內容 notePlaceholder 是備註留空時記下的字 */
export type ConfirmDraft = {
  ruleId: number;
  period: MonthKey;
  name: string;
  kind: EntryKind;
  amount: number;
  date: DateKey;
  minDate: DateKey;
  /** 帳戶與分類在這裡不能改 寫出來讓人確認記到哪裡 */
  where: FactRow[];
  notePlaceholder: string;
  regularBuy: RegularBuyDraft | null;
};

/** 待處理的薪水 那一期的金額 入帳帳戶 分類與日期先填好 送出時一起認領那一期 */
export type SalaryPrefill = { ruleId: number; period: MonthKey; amount: number; accountId: number; categoryId: number | null; date: DateKey };

/**
 * 要處理的那一列與它的視窗要先填好的內容 每種動作各帶一種
 * rule 是固定收支才有的 ⋮ 略過這一期與修改
 */
export type PendingEntry = {
  row: PendingRowView;
  rule: { ruleId: number; period: MonthKey } | null;
  bill?: BillDraft;
  pay?: PayCardDraft;
  confirm?: ConfirmDraft;
  salary?: SalaryPrefill;
};

type PendingSources = {
  accounts: AccountLike[];
  rules: PendingRuleRow[];
  holdings: HoldingLike[];
  quotes: readonly Quote[] | null;
  categories: Pick<CategoryLike, "id" | "name">[];
  /** 填帳單視窗的預設 accountsState 算好的 */
  fills: ReadonlyMap<number, BillDefaults>;
  today: DateKey;
};

/** 備註留空時伺服器記下的字 跟它用同一個規則 沒有預設時給個例子 */
function notePlaceholder(rule: PendingRuleRow, symbol: string | null): string {
  if (symbol !== null) return `留空會寫「買進 ${symbol} N 股」`;
  const fallback = rule.note ?? rule.name;
  return fallback ? `留空會寫「${fallback}」` : "例如：10 月電費";
}

export function pendingEntries(items: PendingItem[], { accounts, rules, holdings, quotes, categories, fills, today }: PendingSources): PendingEntry[] {
  const accountById = new Map(accounts.map((account) => [account.id, account]));
  const ruleById = new Map(rules.map((rule) => [rule.id, rule]));
  const holdingById = new Map(holdings.map((holding) => [holding.id, holding]));
  const categoryNames = new Map(categories.map((category) => [category.id, category.name]));
  const quoteBySymbol = new Map((quotes ?? []).map((quote) => [quote.symbol, quote]));
  // 收支沒有轉入的帳戶 只看用得到的帳戶開始記帳的日期
  const startOf = (...ids: (number | null)[]) => latestOf(ids.map((id) => (id === null ? undefined : accountById.get(id))).map((account) => account && accountStartDate(account))) ?? MIN_DATE;

  return items.flatMap((item): PendingEntry[] => {
    const row = pendingRowView(item);
    if (item.type === "card") {
      const card = { cardId: item.accountId, cardName: item.name, payFromAccountId: item.payFromAccountId, minDate: startOf(item.accountId) };
      if (!item.needsBill) return [{ row, rule: null, pay: { ...card, amount: item.amount } }];
      const fill = fills.get(item.accountId);
      return fill ? [{ row, rule: null, bill: billDraft(card, fill, item.statementDate) }] : [];
    }
    const rule = ruleById.get(item.ruleId);
    if (!rule) return [];
    const ruleRef = { ruleId: item.ruleId, period: item.period };
    if (item.allocate) {
      return [{ row, rule: ruleRef, salary: { ruleId: item.ruleId, period: item.period, amount: item.amount, accountId: item.accountId, categoryId: item.categoryId, date: item.date } }];
    }
    const holding = item.holdingId === null ? undefined : holdingById.get(item.holdingId);
    const quote = holding ? quoteBySymbol.get(holding.symbol) : undefined;
    const accountName = accountById.get(item.accountId)?.name ?? "";
    const counterName = item.counterAccountId === null ? null : (accountById.get(item.counterAccountId)?.name ?? "");
    const categoryName = item.categoryId === null ? null : (categoryNames.get(item.categoryId) ?? null);
    const where: FactRow[] =
      counterName !== null ? [{ label: "帳戶", value: `${accountName} → ${counterName}` }] : [{ label: "帳戶", value: accountName }, ...(categoryName ? [{ label: "分類", value: categoryName }] : [])];
    return [
      {
        row,
        rule: ruleRef,
        confirm: {
          ruleId: item.ruleId,
          period: item.period,
          name: item.name,
          kind: item.kind,
          amount: item.amount,
          date: confirmDate(item.date, today),
          minDate: startOf(item.accountId, item.counterAccountId),
          where,
          notePlaceholder: notePlaceholder(rule, holding?.symbol ?? null),
          regularBuy: holding
            ? { symbol: holding.symbol, name: holding.name, closeCents: quote?.closeCents ?? null, quoteDate: quote?.date ?? null, estimate: estimateRegularBuy(item.amount, quote?.closeCents ?? null) }
            : null,
        },
      },
    ];
  });
}
