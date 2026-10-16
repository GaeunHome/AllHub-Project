import { payableDueDate, type CardBill } from "./cards";
import { addDays, type DateKey } from "./dates";
import type { TransactionKind } from "./kinds";
import { addMonths, dateToMonth, monthToDate, type MonthKey } from "./month";
import { pendingItems, type PendingContext, type PendingRuleRow } from "./pending";
import { PENDING_LOOKAHEAD_DAYS, occurrencesBetween, pendingOccurrences, recurringTitle, scheduledDate, type Occurrence } from "./recurring";

// 總覽的這個月要做的事 做完的留著打勾
// 固定收支照每一期的日期 信用卡待填帳單照結帳日 填了之後照截止日

/** auto 是自動記帳還沒到 auto-done 是自動記好了 */
export type ChecklistState = "done" | "skipped" | "todo" | "overdue" | "auto" | "auto-done";

export type ChecklistKind = "salary" | "card" | "regular-buy" | "recurring";

/** unbilled 是還沒結帳 needs-bill 是待填帳單 unpaid 是待繳 paid 是繳清 */
export type ChecklistCardStage = "unbilled" | "needs-bill" | "unpaid" | "paid";

export type ChecklistItem = {
  /** 跟待處理的 key 一樣 用來找視窗的內容 */
  key: string;
  kind: ChecklistKind;
  /** 信用卡填了帳單是截止日 還沒填是結帳日 */
  date: DateKey;
  title: string;
  /** 做完的是實際金額 還沒填帳單的是估計 還沒結帳的是 null */
  amount: number | null;
  estimated: boolean;
  state: ChecklistState;
  /** 略過的是 null */
  doneOn: DateKey | null;
  /** 上個月以前沒處理的 */
  carriedOver: boolean;
  /** 日期在下個月的 月底才看得到 信用卡的截止日可能超過 7 天 */
  upcoming: boolean;
  ruleId: number | null;
  period: MonthKey | null;
  cardId: number | null;
  /** 現在就能處理 視窗的內容在待處理裡 要先處理更早的那一期 7 天後才到或還沒結帳的不行 */
  actionable: boolean;
  /** 只有信用卡有 */
  cardStage: ChecklistCardStage | null;
};

/** 固定收支記下的紀錄 recurringPeriod 是 null 的是沒有期別的舊自動紀錄 */
export type ChecklistRecord = { recurringId: number; recurringPeriod: string | null; kind: TransactionKind; amount: number; date: DateKey };

/** 填過的帳單與繳了多少 dueDate 是填的 還沒順延 */
export type ChecklistStatement = { accountId: number; statementDate: DateKey; dueDate: DateKey; amount: number; paid: number; lastPaidOn: DateKey | null };

/** 登入者自己的帳戶 分類與持股 信用卡多了結帳日 */
export type ChecklistContext = Omit<PendingContext, "accounts"> & { accounts: (PendingContext["accounts"][number] & { statementDay: number | null })[] };

/**
 * bills 是每張卡最近一期 accountsState 算好的
 * records 要涵蓋上個月 1 號以後記的 提早確認的那一筆可能在上個月
 */
export type ChecklistInput = {
  rules: PendingRuleRow[];
  bills: readonly CardBill[];
  statements: readonly ChecklistStatement[];
  records: readonly ChecklistRecord[];
  context: ChecklistContext;
};

type Placement = Pick<ChecklistItem, "carriedOver" | "upcoming">;
const THIS_MONTH: Placement = { carriedOver: false, upcoming: false };

function ruleKind(rule: Pick<PendingRuleRow, "allocate" | "holdingId">): ChecklistKind {
  if (rule.allocate) return "salary";
  return rule.holdingId === null ? "recurring" : "regular-buy";
}

/**
 * 規則與用到的帳戶都要啟用中 跟待處理一樣
 * 要處理的列只有待處理裡也有的那一期才按得了 同一天信用卡在前
 */
export function monthChecklist(input: ChecklistInput, today: DateKey): ChecklistItem[] {
  const month = dateToMonth(today);
  const monthStart = monthToDate(month);
  const monthEnd = scheduledDate(month, 31);
  const horizon = addDays(today, PENDING_LOOKAHEAD_DAYS);
  // 月底時看到下個月 7 天內的
  const until = horizon > monthEnd ? horizon : monthEnd;
  const actionable = new Set(pendingItems(input.rules, [...input.bills], today, input.context).map((item) => item.key));
  const accounts = new Map(input.context.accounts.map((account) => [account.id, account]));
  const usable = (id: number | null) => id === null || accounts.get(id)?.active === true;
  const names = {
    accounts: new Map(input.context.accounts.map((account) => [account.id, account.name])),
    categories: new Map(input.context.categories.map((category) => [category.id, category.name])),
    holdingSymbols: new Map(input.context.holdings.map((holding) => [holding.id, holding.symbol])),
  };

  // 薪水分出去的轉帳也標了同一期 只認跟規則同一種的那一筆
  const recordOf = (rule: PendingRuleRow, occurrence: Occurrence) =>
    input.records.find(
      (record) =>
        record.recurringId === rule.id &&
        record.kind === rule.kind &&
        (record.recurringPeriod === null ? record.date === occurrence.date : dateToMonth(record.recurringPeriod) === occurrence.period),
    );

  const ruleRow = (rule: PendingRuleRow, occurrence: Occurrence, placement: Placement): ChecklistItem => {
    const key = `recurring:${rule.id}:${occurrence.period}`;
    const base = { key, kind: ruleKind(rule), date: occurrence.date, title: recurringTitle(rule, names), estimated: false, ruleId: rule.id, period: occurrence.period, cardId: null, cardStage: null, ...placement };
    const handled = rule.lastPostedMonth !== null && occurrence.period <= dateToMonth(rule.lastPostedMonth);
    if (!handled) {
      const state = rule.mode === "auto" ? "auto" : occurrence.date < today ? "overdue" : "todo";
      return { ...base, state, amount: rule.amount, doneOn: null, actionable: actionable.has(key) };
    }
    // 游標之前的期別沒有紀錄 就是略過了 或是停用時排程往前推的
    const record = recordOf(rule, occurrence);
    if (!record) return { ...base, state: "skipped", amount: rule.amount, doneOn: null, actionable: false };
    return { ...base, state: rule.mode === "auto" ? "auto-done" : "done", amount: record.amount, doneOn: record.date, actionable: false };
  };

  const ruleRows = input.rules.flatMap((rule): ChecklistItem[] => {
    if (!rule.active || !usable(rule.accountId) || !usable(rule.counterAccountId)) return [];
    const rows = occurrencesBetween(rule, monthStart, until).map((occurrence) => ruleRow(rule, occurrence, { carriedOver: false, upcoming: occurrence.date > monthEnd }));
    // 自動記的會由排程補上 不算沒處理
    if (rule.mode === "confirm") {
      for (const occurrence of pendingOccurrences(rule, today)) {
        if (occurrence.date < monthStart) rows.push(ruleRow(rule, occurrence, { carriedOver: true, upcoming: false }));
      }
    }
    return rows;
  });

  type Card = ChecklistContext["accounts"][number];
  const cardBase = (card: Card, statementDate: DateKey, placement: Placement) => {
    const key = `card:${card.id}:${statementDate}`;
    return { key, kind: "card" as const, title: card.name, ruleId: null, period: null, cardId: card.id, actionable: actionable.has(key), ...placement };
  };

  // 最近結帳的那一期 待填帳單的日期是結帳日 填了之後是遇假日順延後的截止日
  // 月底結帳的截止日常在下個月 跟其他下個月的一樣排在後面
  const billRow = (card: Card, bill: CardBill & { statementDate: DateKey }, carriedOver: boolean): ChecklistItem => {
    const base = (date: DateKey) => ({ ...cardBase(card, bill.statementDate, { carriedOver, upcoming: date > monthEnd }), date });
    if (bill.needsBill) return { ...base(bill.statementDate), state: "todo", amount: bill.estimate, estimated: true, doneOn: null, cardStage: "needs-bill" };
    const dueDate = bill.dueDate ?? bill.statementDate;
    if (bill.remainingDue > 0) return { ...base(dueDate), state: dueDate < today ? "overdue" : "todo", amount: bill.remainingDue, estimated: false, doneOn: null, cardStage: "unpaid" };
    // 0 元的帳單沒有繳款 寫結帳日
    const paidOn = input.statements.find((statement) => statement.accountId === card.id && statement.statementDate === bill.statementDate)?.lastPaidOn ?? null;
    return { ...base(dueDate), state: "done", amount: bill.statementAmount, estimated: false, doneOn: paidOn ?? bill.statementDate, cardStage: "paid" };
  };

  const cardRows = input.context.accounts.flatMap((card): ChecklistItem[] => {
    if (card.kind !== "credit" || !card.active) return [];
    const rows: ChecklistItem[] = [];
    const bill = input.bills.find((candidate) => candidate.accountId === card.id);
    // 沒有結帳日的卡還沒填過帳單時沒有這一期
    if (bill && bill.statementDate !== null) {
      const latest = { ...bill, statementDate: bill.statementDate };
      const dueDate = latest.dueDate ?? latest.statementDate;
      if (latest.needsBill) rows.push(billRow(card, latest, latest.statementDate < monthStart));
      else if (latest.remainingDue > 0) rows.push(billRow(card, latest, dueDate < monthStart));
      else if (latest.statementDate >= monthStart || (dueDate >= monthStart && dueDate <= monthEnd)) rows.push(billRow(card, latest, false));
      // 前一期在這個月截止而且繳清的留著打勾 沒繳清的會併進這一期
      const previous = input.statements
        .filter((statement) => statement.accountId === card.id && statement.statementDate < latest.statementDate)
        .reduce<ChecklistStatement | undefined>((newest, statement) => (newest === undefined || statement.statementDate > newest.statementDate ? statement : newest), undefined);
      const previousDue = previous && payableDueDate(previous.dueDate);
      if (previous && previousDue && previous.paid >= previous.amount && previousDue >= monthStart && previousDue <= monthEnd) {
        rows.push({ ...cardBase(card, previous.statementDate, THIS_MONTH), actionable: false, date: previousDue, state: "done", amount: previous.amount, estimated: false, doneOn: previous.lastPaidOn ?? previous.statementDate, cardStage: "paid" });
      }
    }
    // 今天結帳的要明天才算出來 所以今天也還沒結帳
    if (card.statementDay !== null) {
      for (const statementDate of [scheduledDate(month, card.statementDay), scheduledDate(addMonths(month, 1), card.statementDay)]) {
        if (statementDate < today || statementDate > until) continue;
        const placement = { carriedOver: false, upcoming: statementDate > monthEnd };
        rows.push({ ...cardBase(card, statementDate, placement), date: statementDate, state: "todo", amount: null, estimated: false, doneOn: null, cardStage: "unbilled" });
      }
    }
    return rows;
  });

  const order = (item: ChecklistItem) => (item.kind === "card" ? 0 : 1);
  const id = (item: ChecklistItem) => item.cardId ?? item.ruleId ?? 0;
  return [...cardRows, ...ruleRows].sort((a, b) => Number(b.carriedOver) - Number(a.carriedOver) || a.date.localeCompare(b.date) || order(a) - order(b) || id(a) - id(b));
}
