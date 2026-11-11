import { dueText, formatSlashDate } from "../lib/dates";
import { ACCOUNT_KIND_LABELS, CARD_STYLES, type AccountKind, type CardStyle } from "../lib/kinds";
import { accountStartDate, bySortOrder, type AccountMonthFlow } from "../lib/ledger";
import { formatTwd } from "../lib/money";
import { accountDetails, creditOverdue, type CreditDetail, type DepositDetail } from "./account-details";
import type { AccountsInput, AccountsState, OverviewAccount } from "./accounts-state";
import type { AccountDraft } from "./components/forms/account-form";
import { activeAccountsInOrder } from "./form-options";
import { overdueBadge, type FactRow } from "./format";
import type { AccountUsage } from "./settings-display";

// 帳戶頁 伺服器整理好畫面要的形狀

type Badge = { label: string; tone: "danger" | "warning" };
const GROUP_ORDER: readonly AccountKind[] = ["deposit", "investment", "credit"];

/**
 * 沒選卡面顏色的照建立順序輪流 跳過別張選走的顏色
 * 停用的卡也算在順序裡 停用別張卡時顏色才不會跟著換
 */
export function cardStyles(accounts: readonly Pick<OverviewAccount, "id" | "kind" | "createdAt" | "cardStyle">[]): Map<number, CardStyle> {
  const cards = accounts.filter((account) => account.kind === "credit").sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id - b.id);
  const chosen = new Set(cards.flatMap((card) => (card.cardStyle ? [card.cardStyle] : [])));
  const free = CARD_STYLES.filter((style) => !chosen.has(style));
  const palette = free.length > 0 ? free : CARD_STYLES;
  let next = 0;
  return new Map(cards.map((card) => [card.id, card.cardStyle ?? palette[next++ % palette.length]]));
}

/** 信用卡卡面下面的幾列 action 是這張卡現在要按的 標籤只給待填帳單與逾期 */
export type CardStatusView = { facts: FactRow[]; badge: Badge | null; action: "bill" | "pay" | null };

type CardStatusSource = Pick<CreditDetail, "needsBill" | "statementDate" | "dueDate" | "remainingDue" | "statementAmount" | "owedNow" | "unbilled" | "balance" | "status" | "daysLeft" | "statementDay">;

/**
 * 結帳了要填帳單 填了還沒繳清要繳 沒有結帳日的卡帳單來了隨時可以填
 * 繳了一部分時寫還要繳多少 才不會以為整張都沒繳
 */
export function cardStatusView(detail: CardStatusSource): CardStatusView {
  // 結帳後又刷的另外一列 不然記了也看不出來
  const afterStatement: FactRow[] = detail.unbilled > 0 ? [{ label: "未出帳", value: formatTwd(detail.unbilled) }] : [];
  if (detail.needsBill && detail.statementDate !== null) {
    return { facts: [{ label: "結帳日", value: formatSlashDate(detail.statementDate) }, ...afterStatement], badge: { label: "待填帳單", tone: "warning" }, action: "bill" };
  }
  if (detail.dueDate !== null && detail.remainingDue > 0) {
    const paidSome = detail.statementAmount !== null && detail.remainingDue < detail.statementAmount;
    const amount = { label: paidSome ? "本期還要繳" : "本期應繳", value: formatTwd(detail.remainingDue) };
    const dueOn = formatSlashDate(detail.dueDate);
    if (creditOverdue(detail)) return { facts: [amount, { label: "截止日", value: dueOn }, ...afterStatement], badge: overdueBadge(detail.daysLeft), action: "pay" };
    const due = detail.daysLeft === 0 ? "今天" : detail.daysLeft === null ? dueOn : `${dueOn}（${dueText(detail.daysLeft)}）`;
    return { facts: [amount, { label: "截止日", value: due }, ...afterStatement], badge: null, action: "pay" };
  }
  const action = detail.statementDay === null ? "bill" : null;
  if (detail.balance > 0) return { facts: [{ label: "溢繳", value: formatTwd(detail.balance) }], badge: null, action };
  // 還沒結帳的消費叫未出帳 跟銀行 App 一樣
  const unbilled = { label: "未出帳", value: formatTwd(detail.owedNow) };
  if (detail.statementAmount !== null) {
    const settled = { label: "本期", value: detail.statementAmount > 0 ? "已繳清" : "不用繳" };
    return { facts: detail.owedNow > 0 ? [settled, unbilled] : [settled], badge: null, action };
  }
  return { facts: [unbilled], badge: null, action };
}

type RuleAccounts = { accountId: number; counterAccountId: number | null };

/** 刪除帳戶前的確認要說的 會一起刪的固定收支有幾筆 有沒有紀錄與轉帳 */
export function accountUsage(id: number, rules: readonly RuleAccounts[], flows: readonly AccountMonthFlow[]): AccountUsage {
  const own = flows.filter((flow) => flow.accountId === id);
  return {
    recurringCount: rules.filter((rule) => rule.accountId === id || rule.counterAccountId === id).length,
    hasRecords: own.length > 0,
    hasTransfers: own.some((flow) => flow.transferIn > 0 || flow.transferOut > 0),
  };
}

/** 修改帳戶的視窗帶入的原本設定 不帶 userId */
export const accountDraft = (account: OverviewAccount): AccountDraft => ({
  id: account.id,
  name: account.name,
  kind: account.kind,
  label: account.label ?? null,
  cardStyle: account.cardStyle ?? null,
  openingBalance: account.openingBalance,
  openingCost: account.openingCost,
  monthlyPlan: account.monthlyPlan,
  targetAmount: account.targetAmount,
  statementDay: account.statementDay,
  payFromAccountId: account.payFromAccountId,
  autopay: account.autopay,
  startDate: accountStartDate(account),
});

/** 卡面下方的字 只寫自己設的 沒有卡號 */
function faceLines(account: OverviewAccount, payFromName: string | undefined): string[] {
  const statement = account.statementDay === null ? "沒有設定結帳日" : `每月 ${account.statementDay} 日結帳`;
  return [statement, ...(payFromName === undefined ? [] : [`從${payFromName}扣款`]), ...(account.autopay ? ["自動扣繳"] : [])];
}

/** 修改的表單 刪除前的確認與上移下移 上移下移只在同一類啟用中的帳戶裡 */
type ManagedAccount = { draft: AccountDraft; usage: AccountUsage; isFirst: boolean; isLast: boolean };

export type DepositCardView = ManagedAccount & { detail: DepositDetail };

/** style 是卡面的顏色 faceLines 是卡面下方的字 status 是卡面下面那一行 */
export type CreditCardView = ManagedAccount & { detail: CreditDetail; style: CardStyle; faceLines: string[]; status: CardStatusView };

/** 不同類型的帳戶排在一起 所以寫出類型 label 是用途 */
export type InactiveAccountView = { id: number; name: string; kindLabel: string; label: string | null; draft: AccountDraft; usage: AccountUsage };

export type AccountsPageView = {
  deposits: DepositCardView[];
  /** 啟用中的存款餘額合計 */
  depositTotal: number;
  cards: CreditCardView[];
  /** 啟用中的信用卡目前未繳合計 */
  owedTotal: number;
  /** 照存款 投資 信用卡排 證券帳戶停用後也在這裡恢復 */
  inactive: InactiveAccountView[];
  /** 信用卡扣款帳戶的選項 停用的也帶上 修改時才留得住原本選的 */
  payFromAccounts: { id: number; name: string; active: boolean }[];
};

/** rules 是固定收支 刪除帳戶時會一起刪 */
export function accountsPageView(input: AccountsInput, state: AccountsState, rules: readonly RuleAccounts[]): AccountsPageView {
  const details = new Map(accountDetails(input, state).map((detail) => [detail.id, detail]));
  const names = new Map(input.accounts.map((account) => [account.id, account.name]));
  const styles = cardStyles(input.accounts);
  const active = activeAccountsInOrder(input.accounts);
  const ofKind = (kind: AccountKind) => active.filter((account) => account.kind === kind);
  const managed = (account: OverviewAccount, index: number, count: number): ManagedAccount => ({
    draft: accountDraft(account),
    usage: accountUsage(account.id, rules, input.flows),
    isFirst: index === 0,
    isLast: index === count - 1,
  });

  const deposits = ofKind("deposit").flatMap((account, index, list): DepositCardView[] => {
    const detail = details.get(account.id);
    return detail?.kind === "deposit" ? [{ ...managed(account, index, list.length), detail }] : [];
  });
  const cards = ofKind("credit").flatMap((account, index, list): CreditCardView[] => {
    const detail = details.get(account.id);
    if (detail?.kind !== "credit") return [];
    const payFromName = account.payFromAccountId === null ? undefined : names.get(account.payFromAccountId);
    return [{ ...managed(account, index, list.length), detail, style: styles.get(account.id) ?? CARD_STYLES[0], faceLines: faceLines(account, payFromName), status: cardStatusView(detail) }];
  });
  const inactive = input.accounts
    .filter((account) => !account.active)
    .sort((a, b) => GROUP_ORDER.indexOf(a.kind) - GROUP_ORDER.indexOf(b.kind) || bySortOrder(a, b))
    .map((account): InactiveAccountView => ({
      id: account.id,
      name: account.name,
      kindLabel: ACCOUNT_KIND_LABELS[account.kind],
      label: account.label ?? null,
      draft: accountDraft(account),
      usage: accountUsage(account.id, rules, input.flows),
    }));

  return {
    deposits,
    depositTotal: state.summary.deposit,
    cards,
    owedTotal: state.summary.owed,
    inactive,
    payFromAccounts: input.accounts
      .filter((account) => account.kind === "deposit")
      .sort(bySortOrder)
      .map(({ id, name, active }) => ({ id, name, active })),
  };
}
