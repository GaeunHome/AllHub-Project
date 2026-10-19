import { formatSlashDate, latestOf, type DateKey } from "../lib/dates";
import type { CategoryKind, RecurringMode } from "../lib/kinds";
import { suggestAllocation, type AccountBalance, type AllocationLine } from "../lib/ledger";
import { formatSignedTwd } from "../lib/money";
import { addMonths, dateToMonth, monthIndex } from "../lib/month";
import { firstPeriod, nextRunDate, occurrenceDate, scheduledDate, type RecurringLike } from "../lib/recurring";
import { amountFromText } from "../lib/validation";
import type { SalaryAccountOption } from "./components/forms/options";

// 視窗裡的即時試算與預設值 送出後一律以伺服器的驗證與計算為準

/** 更新餘額輸入框下的說明 text 看不懂或是負數時當成還沒填 伺服器也不收 */
export function balanceHint(balance: number, text: string): string {
  const figure = amountFromText(text);
  if (figure === null) return "差額會記成一筆今天的「調整」，不算收入也不算支出。";
  if (figure === balance) return "跟記錄的一樣，不會多記一筆。";
  return `會記一筆今天的調整：${formatSignedTwd(figure - balance)}`;
}

/** 選項都是啟用中的帳戶 薪水還沒填時用 0 試算 */
export function suggestLines(accounts: readonly SalaryAccountOption[], receivingAccountId: number, salary: number | null): AllocationLine[] {
  const balances = new Map<number, AccountBalance>(accounts.map((account) => [account.id, { balance: account.balance, cost: null, profit: null, owed: null }]));
  return suggestAllocation(
    accounts.map((account) => ({ ...account, active: true })),
    balances,
    receivingAccountId,
    salary ?? 0,
  ).lines;
}

/** amount 清空當成 0 不轉 打錯是 null 因為伺服器不收 */
export type SalaryLine = AllocationLine & { text: string; amount: number | null; invalid: boolean };

/**
 * remainder 是留在入帳帳戶的錢 薪水沒填或打錯時是 null
 * 有一行打錯或分出去的比薪水多時 blocked 不能送出
 */
export type SalaryPreview = { lines: SalaryLine[]; remainder: number | null; blocked: boolean };

/** 改過的行用改過的字 edits 以帳戶 id 為 key */
export function salaryPreview(accounts: readonly SalaryAccountOption[], receivingAccountId: number, salaryText: string, edits: Readonly<Record<number, string>>): SalaryPreview {
  const salary = amountFromText(salaryText);
  const lines = suggestLines(accounts, receivingAccountId, salary).map((line): SalaryLine => {
    const text = edits[line.accountId] ?? String(line.suggested);
    const amount = text.trim() === "" ? 0 : amountFromText(text);
    return { ...line, text, amount, invalid: amount === null };
  });
  const remainder = salary === null ? null : lines.reduce((left, line) => left - (line.amount ?? 0), salary);
  return { lines, remainder, blocked: lines.some((line) => line.invalid) || (remainder !== null && remainder < 0) };
}

/** 入帳帳戶與真的要轉入的帳戶都要已經開始記帳 伺服器才收 */
export function salaryStartDate(accounts: readonly SalaryAccountOption[], receivingAccountId: number, lines: readonly SalaryLine[]): string | undefined {
  const startOf = (id: number) => accounts.find((account) => account.id === id)?.startDate;
  return latestOf([startOf(receivingAccountId), ...lines.filter((line) => (line.amount ?? 0) > 0).map((line) => startOf(line.accountId))]) ?? undefined;
}

/** 發薪分配視窗的狀態 edits 是改過的各行的字 */
export type SalaryFormState = { receivingId: number; salaryText: string; edits: Record<number, string> };
export type SalaryFormEvent = { type: "salary"; text: string } | { type: "receiving"; id: number } | { type: "edit"; accountId: number; text: string };

/** 換入帳帳戶時建議會跟著變 原本的入帳帳戶可能變成一行 改過的金額一起清掉 */
export function salaryFormReducer(state: SalaryFormState, event: SalaryFormEvent): SalaryFormState {
  switch (event.type) {
    case "salary":
      return { ...state, salaryText: event.text };
    case "receiving":
      return { ...state, receivingId: event.id, edits: {} };
    case "edit":
      return { ...state, edits: { ...state.edits, [event.accountId]: event.text } };
  }
}

/** 確認的日期預設那一期的日期 還沒到的話先寫今天 不能記未來 */
export function confirmDate(occurrence: DateKey, today: DateKey): DateKey {
  return occurrence <= today ? occurrence : today;
}

/** 發薪分配預設記在薪水 沒有的話用第一個收入分類 */
export function defaultIncomeCategory(categories: readonly { id: number; name: string; kind: CategoryKind }[]): number | undefined {
  const income = categories.filter((category) => category.kind === "income");
  return (income.find((category) => category.name === "薪水") ?? income[0])?.id;
}

/** keep 是修改時原本的帳戶 停用了也留著 儲存時才不會默默換掉 */
export function choosableAccounts<T extends { id: number; active: boolean }>(accounts: readonly T[], ...keep: (number | null | undefined)[]): T[] {
  return accounts.filter((account) => account.active || keep.includes(account.id));
}

/** 下一期原本的日子 假日提前或延後可能跨月 所以前後一個月都看 只認排得到的期別 */
function unshiftedDate(rule: RecurringLike, next: DateKey): DateKey | null {
  const first = monthIndex(firstPeriod(rule));
  for (const month of [-1, 0, 1].map((delta) => addMonths(dateToMonth(next), delta))) {
    const offset = monthIndex(month) - first;
    if (offset >= 0 && offset % rule.intervalMonths === 0 && occurrenceDate(rule, month) === next) return scheduledDate(month, rule.dayOfMonth);
  }
  return null;
}

/**
 * 固定收支表單下面那一行 遇假日調整過時寫出原本的日子
 * 要確認的那一期到期了還沒處理 還在等確認 不寫成下一期 新的規則寫第一期
 */
export function nextRunText(rule: RecurringLike & { mode: RecurringMode }, today: DateKey, fresh: boolean): string {
  const next = nextRunDate(rule, today);
  const original = unshiftedDate(rule, next);
  const shifted = original !== null && original !== next ? `，${formatSlashDate(original)} 遇假日${original > next ? "提前" : "延後"}` : "";
  const label = fresh ? "第一期" : rule.mode === "confirm" && next <= today ? "待確認" : rule.lastPostedMonth === null ? "第一期" : "下一期";
  return `${label} ${formatSlashDate(next)}${shifted}`;
}
