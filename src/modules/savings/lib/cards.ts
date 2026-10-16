import { addDays, daysBetween, dueStatus, type DateKey, type DueStatus } from "./dates";
import { shiftForHoliday } from "./holidays";
import { addMonths, dateToMonth, type MonthKey } from "./month";
import { scheduledDate } from "./recurring";

// 帳單金額照銀行的 不是每筆刷卡都有記 填帳單時跟紀錄的差額自動補一筆
// 有結帳日的卡結帳後就要填 沒有結帳日的截止前 10 天才要填

/** 每個帳戶每天的流量 金額都是正數 只有調整帶正負號 轉入算在 counter_account_id */
export type CardDailyFlow = { accountId: number; date: DateKey; income: number; expense: number; transferIn: number; transferOut: number; adjust: number };

export type CardLike = { id: number; statementDay: number | null; dueDay: number | null };

/** 填過的帳單 沒有結帳日的卡 statementDate 是填帳單那天 */
export type CardStatement = { id: number; accountId: number; statementDate: DateKey; dueDate: DateKey; amount: number };

/** none 是不用列進待處理 */
export type CardBillStatus = "none" | DueStatus;

/**
 * 金額都不會是負的 還沒填帳單時 statementAmount 是 null 待處理用 estimate
 * estimate 是照紀錄算的這一期未繳 填帳單的預設值
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

// 沒有結帳日的卡 截止前幾天才要填帳單
const NO_STATEMENT_NOTICE_DAYS = 10;

/** 上次結帳日最多在一個多月前 往前 70 天一定涵蓋結帳後的紀錄 */
export const CARD_FLOW_DAYS = 70;

/** 嚴格早於今天 日子是結帳日的最近一天 今天結帳的帳單要明天才算出來 */
export function lastStatementDate(statementDay: number, today: DateKey): DateKey {
  const month = dateToMonth(today);
  const thisMonth = scheduledDate(month, statementDay);
  return thisMonth < today ? thisMonth : scheduledDate(addMonths(month, -1), statementDay);
}

// 銀行的截止日遇假日順延到下一個營業日 沒有那天的月份先算月底
const shiftedDue = (month: MonthKey, dueDay: number) => shiftForHoliday(scheduledDate(month, dueDay), "after");

/** 結帳日之後第一個日子是截止日的日期 遇假日順延 */
export function dueDateAfter(statementDate: DateKey, dueDay: number): DateKey {
  const month = dateToMonth(statementDate);
  return scheduledDate(month, dueDay) > statementDate ? shiftedDue(month, dueDay) : shiftedDue(addMonths(month, 1), dueDay);
}

/** 今天或之後最近的截止日 順延後的日子當天也算還沒過 */
export function nextDueDate(dueDay: number, today: DateKey): DateKey {
  // 上個月的截止日順延後可能跨到這個月
  const candidates = [-1, 0, 1].map((delta) => shiftedDue(addMonths(dateToMonth(today), delta), dueDay));
  return candidates.find((date) => date >= today) ?? candidates[2];
}

/** 沒填結帳日時是今天這一期 沒有截止日的卡不用填帳單 */
export function currentStatement(card: CardLike, today: DateKey): { statementDate: DateKey; dueDate: DateKey } | null {
  if (card.dueDay === null) return null;
  if (card.statementDay === null) return { statementDate: today, dueDate: nextDueDate(card.dueDay, today) };
  const statementDate = lastStatementDate(card.statementDay, today);
  return { statementDate, dueDate: dueDateAfter(statementDate, card.dueDay) };
}

/** 指定結帳日時的截止日 有結帳日的卡不是那一天就是 null */
export function statementDueDate(card: CardLike, statementDate: DateKey): DateKey | null {
  if (card.dueDay === null) return null;
  if (card.statementDay === null) return nextDueDate(card.dueDay, statementDate);
  return scheduledDate(dateToMonth(statementDate), card.statementDay) === statementDate ? dueDateAfter(statementDate, card.dueDay) : null;
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

/** 繳清了就是 paid 不管有沒有過截止日 */
export function billStatus(bill: { amount: number; paid: number; dueDate: DateKey }, today: DateKey): "paid" | "unpaid" | "overdue" {
  if (bill.paid >= bill.amount) return "paid";
  return bill.dueDate < today ? "overdue" : "unpaid";
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
 * balance 是目前的帳上餘額 信用卡是負的未繳
 * flows 要涵蓋上次結帳日之後 statements 是填過的帳單 別張卡的會略過
 */
export function cardBill(card: CardLike, balance: number, flows: CardDailyFlow[], today: DateKey, statements: readonly CardStatement[] = []): CardBill {
  const owedNow = Math.max(0, 0 - balance);
  const mine = flows.filter((flow) => flow.accountId === card.id);
  // 某天之後的紀錄扣回去就是那天的餘額 之後轉入的是繳款
  const after = (date: DateKey) => mine.filter((flow) => flow.date > date);
  const owedAt = (date: DateKey) => Math.max(0, after(date).reduce((net, flow) => net + flow.income + flow.transferIn + flow.adjust - flow.expense - flow.transferOut, 0) - balance);
  const paidAfter = (date: DateKey) => after(date).reduce((total, flow) => total + flow.transferIn, 0);
  const timing = (dueDate: DateKey | null, listed: boolean) => ({ status: listed && dueDate !== null ? dueStatus(dueDate, today) : ("none" as const), daysLeft: dueDate === null ? null : daysBetween(today, dueDate) });

  const billed = (statement: CardStatement): CardBill => {
    const cutoff = billCutoff(card, statement.statementDate);
    const paid = paidAfter(cutoff);
    const remainingDue = Math.max(0, statement.amount - paid);
    return {
      accountId: card.id,
      owedNow,
      statementDate: statement.statementDate,
      dueDate: statement.dueDate,
      billId: statement.id,
      statementAmount: statement.amount,
      estimate: owedAt(cutoff),
      paid,
      remainingDue,
      needsBill: false,
      ...timing(statement.dueDate, remainingDue > 0),
    };
  };
  const unbilled = (statementDate: DateKey | null, dueDate: DateKey | null, needsBill: boolean): CardBill => {
    const estimate = statementDate === null ? owedNow : owedAt(statementDate);
    const paid = statementDate === null ? 0 : paidAfter(statementDate);
    return { accountId: card.id, owedNow, statementDate, dueDate, billId: null, statementAmount: null, estimate, paid, remainingDue: Math.max(0, estimate - paid), needsBill, ...timing(dueDate, needsBill) };
  };

  const ownStatements = statements.filter((statement) => statement.accountId === card.id);
  if (card.statementDay !== null) {
    const statementDate = lastStatementDate(card.statementDay, today);
    const statement = ownStatements.find((candidate) => candidate.statementDate === statementDate);
    if (statement) return billed(statement);
    const dueDate = card.dueDay === null ? null : dueDateAfter(statementDate, card.dueDay);
    return unbilled(statementDate, dueDate, dueDate !== null);
  }

  if (card.dueDay === null) return unbilled(null, null, false);
  const upcoming = nextDueDate(card.dueDay, today);
  const latest = ownStatements.reduce<CardStatement | undefined>(
    (newest, candidate) => (newest === undefined || candidate.statementDate > newest.statementDate || (candidate.statementDate === newest.statementDate && candidate.id > newest.id) ? candidate : newest),
    undefined,
  );
  if (latest && latest.dueDate >= upcoming) return billed(latest);
  // 新的帳單會把上一期沒繳的算進去 進了截止前 10 天就改填新的
  if (daysBetween(today, upcoming) <= NO_STATEMENT_NOTICE_DAYS) return unbilled(null, upcoming, true);
  const overdue = latest ? billed(latest) : null;
  return overdue && overdue.remainingDue > 0 ? overdue : unbilled(null, upcoming, false);
}
