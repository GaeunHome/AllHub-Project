import { addDays, daysBetween, dueStatus, type DateKey, type DueStatus } from "./dates";
import { shiftForHoliday } from "./holidays";
import { addMonths, dateToMonth } from "./month";
import { scheduledDate } from "./recurring";

// 帳單的金額與截止日照銀行的 不是每筆刷卡都有記 填帳單時跟紀錄的差額自動補一筆
// 有結帳日的卡結帳後就要填 沒有結帳日的自己在帳戶詳情填

/** 每個帳戶每天的流量 金額都是正數 只有調整帶正負號 轉入算在 counter_account_id */
export type CardDailyFlow = { accountId: number; date: DateKey; income: number; expense: number; transferIn: number; transferOut: number; adjust: number };

export type CardLike = { id: number; statementDay: number | null };

/**
 * 填過的帳單 dueDate 照帳單填的存 遇假日還沒順延
 * 沒有結帳日的卡 statementDate 是填帳單那天
 */
export type CardStatement = { id: number; accountId: number; statementDate: DateKey; dueDate: DateKey; amount: number };

/** none 是不用列進待處理 needs-bill 是結帳了還沒填帳單 還不知道截止日 */
export type CardBillStatus = "none" | "needs-bill" | DueStatus;

/**
 * 金額都不會是負的 還沒填帳單時 statementAmount 與 dueDate 是 null 待處理用 estimate
 * dueDate 是遇假日順延後的 estimate 是照紀錄算的結帳日未繳
 */
export type CardBill = {
  accountId: number;
  owedNow: number;
  statementDate: DateKey | null;
  dueDate: DateKey | null;
  billId: number | null;
  statementAmount: number | null;
  estimate: number;
  paid: number;
  remainingDue: number;
  needsBill: boolean;
  status: CardBillStatus;
  daysLeft: number | null;
};

/**
 * 填帳單視窗的預設 statementDate 是這次要填的那一期 沒有結帳日的卡是今天
 * dueDate 是帳單上印的日子 shiftedDueDate 是遇假日順延後真正的期限
 */
export type BillDefaults = { statementDate: DateKey; estimate: number; dueDate: DateKey; shiftedDueDate: DateKey };

/** 上次結帳日最多在一個多月前 往前 70 天一定涵蓋結帳後的紀錄 */
export const CARD_FLOW_DAYS = 70;

/** 截止日最晚是結帳後幾天 銀行多半是兩三週 再晚多半是打錯 */
export const MAX_DUE_DAYS = 60;

// 沒有上一張帳單也沒有舊的截止日設定時 先抓結帳後兩週多
const FALLBACK_DUE_DAYS = 15;

/** 嚴格早於今天 日子是結帳日的最近一天 今天結帳的帳單要明天才算出來 */
export function lastStatementDate(statementDay: number, today: DateKey): DateKey {
  const month = dateToMonth(today);
  const thisMonth = scheduledDate(month, statementDay);
  return thisMonth < today ? thisMonth : scheduledDate(addMonths(month, -1), statementDay);
}

/** 這次要填的那一期 有結帳日是上次結帳日 沒有的話填的那天就是結帳日 */
export function fillStatementDate(card: Pick<CardLike, "statementDay">, today: DateKey): DateKey {
  return card.statementDay === null ? today : lastStatementDate(card.statementDay, today);
}

/** 有結帳日的卡要是結帳日那天 沒有那天的月份是月底 */
export function isStatementDate(card: Pick<CardLike, "statementDay">, date: DateKey): boolean {
  return card.statementDay === null || scheduledDate(dateToMonth(date), card.statementDay) === date;
}

/** 截止日遇假日順延到下一個工作日 跟銀行一樣 已經順延過的不變 */
export function payableDueDate(dueDate: DateKey): DateKey {
  return shiftForHoliday(dueDate, "after");
}

// 結帳日之後第一個日子是 day 的日期 沒有那天的月份是月底
function nextDateOnDay(statementDate: DateKey, day: number): DateKey {
  const month = dateToMonth(statementDate);
  const thisMonth = scheduledDate(month, day);
  return thisMonth > statementDate ? thisMonth : scheduledDate(addMonths(month, 1), day);
}

const newest = <T extends CardStatement>(statements: readonly T[]): T | undefined =>
  statements.reduce<T | undefined>((latest, candidate) => (latest === undefined || candidate.statementDate > latest.statementDate || (candidate.statementDate === latest.statementDate && candidate.id > latest.id) ? candidate : latest), undefined);

/**
 * 填帳單時截止日的預設 是帳單上會印的日子 不順延
 * 照上一張帳單截止日的日子 還沒有帳單用舊的截止日設定 都沒有是結帳後 15 天
 * 同一期再填一次時是上次填的 statements 只要這張卡的
 */
export function defaultDueDate(statementDate: DateKey, statements: readonly CardStatement[], legacyDueDay: number | null): DateKey {
  const same = statements.find((statement) => statement.statementDate === statementDate);
  if (same) return same.dueDate;
  const previous = newest(statements.filter((statement) => statement.statementDate < statementDate));
  const day = previous ? Number(previous.dueDate.slice(8, 10)) : legacyDueDay;
  return day === null ? addDays(statementDate, FALLBACK_DUE_DAYS) : nextDateOnDay(statementDate, day);
}

// 某天之後的紀錄扣回去就是那天的未繳
function owedThrough(cardId: number, balance: number, flows: readonly CardDailyFlow[], date: DateKey): number {
  const later = flows.filter((flow) => flow.accountId === cardId && flow.date > date);
  return Math.max(0, later.reduce((net, flow) => net + flow.income + flow.transferIn + flow.adjust - flow.expense - flow.transferOut, 0) - balance);
}

/**
 * 帳單算到哪一天 之後轉進卡的才是這張帳單的繳款
 * 沒有結帳日的卡算到填帳單的前一天 當天繳的也算已繳
 */
export function billCutoff(card: Pick<CardLike, "statementDay">, statementDate: DateKey): DateKey {
  return card.statementDay === null ? addDays(statementDate, -1) : statementDate;
}

/**
 * 正的是少記的刷卡 負的是多記了 balanceAtCutoff 是紀錄算到結帳日的餘額
 * 帳單 0 時紀錄上的溢繳不算差額 銀行的帳單不會是負的
 */
export function billDifference(bill: number, balanceAtCutoff: number): number {
  const recordedOwed = 0 - balanceAtCutoff;
  return bill === 0 && recordedOwed < 0 ? 0 : bill - recordedOwed;
}

/** 繳清了就是 paid 不管有沒有過截止日 截止日遇假日順延 */
export function billStatus(bill: { amount: number; paid: number; dueDate: DateKey }, today: DateKey): "paid" | "unpaid" | "overdue" {
  if (bill.paid >= bill.amount) return "paid";
  return payableDueDate(bill.dueDate) < today ? "overdue" : "unpaid";
}

/** 每張帳單繳了多少 結帳日之後到下一張的結帳日為止 最新一張到現在 */
export function billPayments(
  card: Pick<CardLike, "statementDay">,
  statements: readonly CardStatement[],
  payments: readonly { date: DateKey; amount: number }[],
): { id: number; paid: number; lastPaidOn: DateKey | null }[] {
  const cutoffs = statements.map((statement) => billCutoff(card, statement.statementDate));
  return statements.map((statement, i) => {
    const from = cutoffs[i];
    // 下一張是結帳日比它晚的裡面最早的那張
    const until = cutoffs.filter((cutoff) => cutoff > from).reduce<DateKey | null>((earliest, cutoff) => (earliest === null || cutoff < earliest ? cutoff : earliest), null);
    const mine = payments.filter((payment) => payment.date > from && (until === null || payment.date <= until));
    const lastPaidOn = mine.reduce<DateKey | null>((latest, payment) => (latest === null || payment.date > latest ? payment.date : latest), null);
    return { id: statement.id, paid: mine.reduce((total, payment) => total + payment.amount, 0), lastPaidOn };
  });
}

/**
 * balance 是目前的帳上餘額 信用卡是負的未繳 flows 要涵蓋上次結帳日之後
 * statements 是填過的帳單 別張卡的會略過 帶了 paid 就用它 流量只有近 70 天 沒有結帳日的卡最新一張可能更早
 */
export function cardBill(card: CardLike, balance: number, flows: CardDailyFlow[], today: DateKey, statements: readonly (CardStatement & { paid?: number })[] = []): CardBill {
  const owedNow = Math.max(0, 0 - balance);
  const owedAt = (date: DateKey) => owedThrough(card.id, balance, flows, date);
  // 某天之後轉進卡的是繳款
  const paidAfter = (date: DateKey) => flows.filter((flow) => flow.accountId === card.id && flow.date > date).reduce((total, flow) => total + flow.transferIn, 0);

  const billed = (statement: CardStatement & { paid?: number }): CardBill => {
    const cutoff = billCutoff(card, statement.statementDate);
    const paid = statement.paid ?? paidAfter(cutoff);
    const remainingDue = Math.max(0, statement.amount - paid);
    const dueDate = payableDueDate(statement.dueDate);
    return {
      accountId: card.id,
      owedNow,
      statementDate: statement.statementDate,
      dueDate,
      billId: statement.id,
      statementAmount: statement.amount,
      estimate: owedAt(cutoff),
      paid,
      remainingDue,
      needsBill: false,
      status: remainingDue > 0 ? dueStatus(dueDate, today) : "none",
      daysLeft: daysBetween(today, dueDate),
    };
  };
  // statementDate 是 null 的是沒有結帳日的卡還沒填過帳單 不用填也不列
  const unbilled = (statementDate: DateKey | null): CardBill => {
    const estimate = statementDate === null ? owedNow : owedAt(statementDate);
    const paid = statementDate === null ? 0 : paidAfter(statementDate);
    const needsBill = statementDate !== null;
    return { accountId: card.id, owedNow, statementDate, dueDate: null, billId: null, statementAmount: null, estimate, paid, remainingDue: Math.max(0, estimate - paid), needsBill, status: needsBill ? "needs-bill" : "none", daysLeft: null };
  };

  const own = statements.filter((statement) => statement.accountId === card.id);
  if (card.statementDay !== null) {
    const statementDate = lastStatementDate(card.statementDay, today);
    const statement = own.find((candidate) => candidate.statementDate === statementDate);
    return statement ? billed(statement) : unbilled(statementDate);
  }
  // 沒有結帳日的卡 最新一張就是這一期 繳清了也照它寫 直到填了下一張
  const latest = newest(own);
  return latest ? billed(latest) : unbilled(null);
}

/** 填帳單視窗的預設 金額照紀錄算到這一期的結帳日 截止日照 defaultDueDate */
export function billDefaults(card: CardLike & { dueDay: number | null }, balance: number, flows: readonly CardDailyFlow[], today: DateKey, statements: readonly CardStatement[] = []): BillDefaults {
  const statementDate = fillStatementDate(card, today);
  const own = statements.filter((statement) => statement.accountId === card.id);
  const dueDate = defaultDueDate(statementDate, own, card.dueDay);
  return { statementDate, estimate: owedThrough(card.id, balance, flows, billCutoff(card, statementDate)), dueDate, shiftedDueDate: payableDueDate(dueDate) };
}
