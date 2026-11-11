import { fail, ok, type Parsed } from "@/core/parsed";
import type { DateKey } from "./dates";
import type { MonthKey } from "./month";
import { NOT_FOUND, PERIOD_INVALID, SAME_ACCOUNT, labelled, optionalId, parseAmount, parseBalance, parseEntryDate, parseNote, parsePeriod, parseRowId, requiredId, type Fields } from "./validation";

// 發薪分配的表單 薪水入帳再轉到各帳戶

/** 只從自己的帳戶找名稱 錯誤訊息才不會洩漏別人的帳戶名稱 */
function salaryLineLabel(rawAccountId: string, accountNames: ReadonlyMap<number, string> | undefined): string {
  const id = parseRowId(rawAccountId);
  const name = id === null ? undefined : accountNames?.get(id);
  return name === undefined ? "分配金額" : `分配給「${name}」的金額`;
}

/** recurring 是從待處理確認薪水那一期時帶的 臨時的獎金是 null */
export type SalaryInput = {
  accountId: number;
  categoryId: number | null;
  amount: number;
  date: DateKey;
  note: string | null;
  transfers: { accountId: number; amount: number }[];
  recurring: { ruleId: number; period: MonthKey } | null;
};

// 一個帳戶只有一行 重複或行數比帳戶多就是表單被改過或畫面太舊
const SALARY_LINES_INVALID = "分配的帳戶不正確，請重新整理頁面再試一次";

/**
 * 金額 0 或留空就略過 剩下的留在入帳帳戶
 * accountNames 用來限制行數與在錯誤裡寫出帳戶名稱
 */
export function parseSalaryFields(
  fields: Fields<"accountId" | "categoryId" | "amount" | "date" | "note"> & { transfers: Fields<"accountId" | "amount">[]; ruleId?: string; period?: string },
  today: DateKey,
  accountNames?: ReadonlyMap<number, string>,
): Parsed<SalaryInput> {
  const ruleId = optionalId(fields.ruleId ?? "", NOT_FOUND.recurring);
  if (!ruleId.ok) return ruleId;
  const period = ruleId.value === null ? null : parsePeriod(fields.period ?? "");
  if (ruleId.value !== null && period === null) return fail(PERIOD_INVALID);
  const accountId = requiredId(fields.accountId, "請選擇入帳的帳戶", NOT_FOUND.account);
  if (!accountId.ok) return accountId;
  const categoryId = optionalId(fields.categoryId, NOT_FOUND.category);
  if (!categoryId.ok) return categoryId;
  const amount = parseAmount(fields.amount);
  if (!amount.ok) return amount;
  const date = parseEntryDate(fields.date, today);
  if (!date.ok) return date;
  const note = parseNote(fields.note);
  if (!note.ok) return note;

  if (accountNames !== undefined && fields.transfers.length > accountNames.size) return fail(SALARY_LINES_INVALID);
  const transfers: SalaryInput["transfers"] = [];
  for (const line of fields.transfers) {
    const lineAmount = line.amount.trim() === "" ? ok(0) : parseBalance(line.amount);
    if (!lineAmount.ok) return labelled(salaryLineLabel(line.accountId, accountNames), lineAmount);
    if (lineAmount.value === 0) continue;
    const lineAccount = requiredId(line.accountId, "請選擇要轉入的帳戶", NOT_FOUND.account);
    if (!lineAccount.ok) return lineAccount;
    if (lineAccount.value === accountId.value) return fail(SAME_ACCOUNT);
    if (transfers.some((transfer) => transfer.accountId === lineAccount.value)) return fail(SALARY_LINES_INVALID);
    transfers.push({ accountId: lineAccount.value, amount: lineAmount.value });
  }
  if (transfers.reduce((total, line) => total + line.amount, 0) > amount.value) return fail("分出去的金額超過薪水了");

  return ok({
    accountId: accountId.value,
    categoryId: categoryId.value,
    amount: amount.value,
    date: date.value,
    note: note.value,
    transfers,
    recurring: ruleId.value === null || period === null ? null : { ruleId: ruleId.value, period },
  });
}
