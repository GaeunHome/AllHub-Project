"use server";

import { requireModule } from "@/core/auth";
import { updateTags } from "@/core/cache";
import { INVALID_FORM_MESSAGE, formId, formText } from "@/core/form";
import type { FormState } from "@/core/ui/form-message";
import { formatSignedTwd, formatTwd } from "../lib/money";
import { savingsTags } from "../service/cache-tags";
import { addTransaction, allocateSalary, deleteTransaction, updateBalance, updateTransaction } from "../service/transactions";
import { attempt, describeEntry, readFields, readNames, remove } from "./action-helpers";

// 記一筆 修改與刪除紀錄 更新餘額與發薪分配

const ENTRY_FIELDS = ["kind", "accountId", "counterAccountId", "categoryId", "amount", "date", "note"] as const;
const SALARY_FIELDS = ["accountId", "categoryId", "amount", "date", "note", "ruleId", "period"] as const;

export async function addTransactionAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { id: userId } = await requireModule("savings");
  return attempt("記帳", async () => {
    const names = await readNames(userId);
    const entry = await addTransaction(userId, readFields(formData, ENTRY_FIELDS));
    updateTags(savingsTags.transactions);
    return `${entry.kind === "transfer" ? "已轉帳" : "已記錄"}：${describeEntry(entry, names)}`;
  });
}

export async function updateTransactionAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { id: userId } = await requireModule("savings");
  const id = formId(formData, "id");
  if (id === null) return { error: INVALID_FORM_MESSAGE };
  return attempt("儲存紀錄", async () => {
    const names = await readNames(userId);
    const entry = await updateTransaction(userId, id, readFields(formData, ENTRY_FIELDS));
    updateTags(savingsTags.transactions);
    return `已儲存：${describeEntry(entry, names)}`;
  });
}

export async function deleteTransactionAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { id: userId } = await requireModule("savings");
  // 買賣紀錄會還原持股 確認來的紀錄會把待處理退回去 帳單補的那一筆連帳單一起刪
  return remove(formData, "刪除紀錄", (id) => deleteTransaction(userId, id), [savingsTags.transactions, savingsTags.holdings, savingsTags.recurring, savingsTags.bills]);
}

/** 信用卡與有持股的投資帳戶 service 會擋下 只剩存款的餘額與投資的市值 */
export async function updateBalanceAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { id: userId } = await requireModule("savings");
  return attempt("更新餘額", async () => {
    const { account, delta } = await updateBalance(userId, { accountId: formText(formData, "accountId"), actual: formText(formData, "actual") });
    // 跟記錄的一樣時 service 不寫入 畫面也不必重算
    if (delta === 0) return `「${account.name}」的${account.kind === "investment" ? "市值" : "餘額"}沒有變`;
    updateTags(savingsTags.transactions);
    return `已更新「${account.name}」：調整 ${formatSignedTwd(delta)}`;
  });
}

/** 轉出的帳戶與金額每個帳戶一組 數量對不上就是表單被改過 */
export async function allocateSalaryAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { id: userId } = await requireModule("savings");
  const accountIds = formData.getAll("transferAccountId").map(String);
  const amounts = formData.getAll("transferAmount").map(String);
  if (accountIds.length !== amounts.length) return { error: INVALID_FORM_MESSAGE };
  // 清空的分配欄位當成不轉 不讓整張表單因為請輸入金額而失敗
  const transfers = accountIds.map((accountId, i) => ({ accountId, amount: amounts[i].trim() === "" ? "0" : amounts[i] }));
  return attempt("入帳並分配", async () => {
    const names = await readNames(userId, { categories: false });
    const fields = readFields(formData, SALARY_FIELDS);
    const result = await allocateSalary(userId, { ...fields, transfers });
    // 從待處理確認時也推了固定收支的游標
    updateTags(...(fields.ruleId.trim() === "" ? [savingsTags.transactions] : [savingsTags.transactions, savingsTags.recurring]));
    // 跟按鈕一樣寫入帳並分配
    const done = `已入帳並分配薪水 ${formatTwd(result.income.amount)}`;
    const receiving = names.account(result.income.accountId);
    if (result.transfers.length === 0) return `${done}，全部留在「${receiving}」`;
    return `${done}，轉出 ${result.transfers.length} 筆，「${receiving}」留下 ${formatTwd(result.remainder)}`;
  });
}
