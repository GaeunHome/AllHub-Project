import { SELECTABLE_COLORS, type AccountKind, type CategoryKind, type PaletteColor } from "../lib/kinds";
import { balanceAdjustment, shownFigure, suggestAllocation, type AccountBalance, type AllocationLine } from "../lib/ledger";
import { formatSignedTwd, formatTwd } from "../lib/money";
import { amountFromText } from "../lib/validation";
import type { SalaryAccountOption } from "./components/forms/options";

// 視窗裡的即時試算與預設值 送出後一律以伺服器的驗證與計算為準

/** 照銀行 App 的寫法 信用卡的負數是溢繳 */
export function figureText(kind: AccountKind, figure: number): string {
  return kind === "credit" && figure < 0 ? `溢繳 ${formatTwd(0 - figure)}` : formatTwd(figure);
}

/**
 * 信用卡改用未繳的角度寫 寫成調整加 480 會被讀成欠更多
 * 沒有差額回 null
 */
export function balanceChangeText(kind: AccountKind, balance: number, figure: number): string | null {
  const delta = balanceAdjustment(kind, balance, figure);
  if (delta === 0) return null;
  if (kind !== "credit") return `調整 ${formatSignedTwd(delta)}`;
  const before = shownFigure(kind, balance);
  return `未繳${figure < before ? "少" : "多"}了 ${formatTwd(Math.abs(figure - before))}（${figureText(kind, before)} → ${figureText(kind, figure)}）`;
}

/** 更新餘額輸入框下的說明 text 看不懂時當成還沒填 存款打負數也是 */
export function balanceHint(kind: AccountKind, balance: number, text: string): string {
  const figure = amountFromText(text, { allowNegative: kind === "credit" });
  if (figure === null) return "差額會記成一筆今天的「調整」，不算收入也不算支出。";
  const change = balanceChangeText(kind, balance, figure);
  if (change === null) return "跟記錄的一樣，不會多記一筆。";
  return kind === "credit" ? `${change}，會記一筆今天的調整。` : `會記一筆今天的調整：${formatSignedTwd(balanceAdjustment(kind, balance, figure))}`;
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

/** 幾個 YYYY-MM-DD 裡最晚的 undefined 略過 */
export function latestDate(dates: readonly (string | undefined)[]): string | undefined {
  return dates.reduce<string | undefined>((latest, date) => (date !== undefined && (latest === undefined || date > latest) ? date : latest), undefined);
}

/** 入帳帳戶與真的要轉入的帳戶都要已經開始記帳 伺服器才收 */
export function salaryStartDate(accounts: readonly SalaryAccountOption[], receivingAccountId: number, lines: readonly SalaryLine[]): string | undefined {
  const startOf = (id: number) => accounts.find((account) => account.id === id)?.startDate;
  return latestDate([startOf(receivingAccountId), ...lines.filter((line) => (line.amount ?? 0) > 0).map((line) => startOf(line.accountId))]);
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

/**
 * 以前存成灰色的改用 fallback 灰色現在留給未分類與未設定用途
 * 伺服器不收 不換的話一儲存就失敗
 */
export function selectableColor(color: PaletteColor, fallback: PaletteColor): PaletteColor {
  return (SELECTABLE_COLORS as readonly PaletteColor[]).includes(color) ? color : fallback;
}

/**
 * 先選還沒用過的顏色 圖表上才分得出來 都用過了就照數量輪替
 * 灰色留給未分類與未設定用途 不會選到
 */
export function nextFreeColor(used: readonly PaletteColor[]): PaletteColor {
  return SELECTABLE_COLORS.find((color) => !used.includes(color)) ?? SELECTABLE_COLORS[used.length % SELECTABLE_COLORS.length];
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
