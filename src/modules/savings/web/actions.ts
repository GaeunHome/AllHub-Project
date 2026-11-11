"use server";

import { refresh } from "next/cache";
import { requireModule } from "@/core/auth";
import { updateTags } from "@/core/cache";
import { INVALID_FORM_MESSAGE, formId, formText } from "@/core/form";
import type { FormState } from "@/core/ui/form-message";
import { createAccount, deleteAccount, moveAccount, setAccountActive, updateAccount, updateAllocation } from "../service/accounts";
import { savingsTags } from "../service/cache-tags";
import { createCategory, deleteCategory, moveCategory, updateCategory } from "../service/categories";
import { setupDefaults } from "../service/setup";
import { attempt, move, readFields, remove, setActive } from "./action-helpers";

// 帳戶 分類與開始使用 記帳 固定收支 投資 信用卡各在同資料夾的 actions-*.ts
// 欄位名稱跟 service 一樣 原樣交給 service 驗證

const ACCOUNT_FIELDS = ["name", "kind", "label", "cardStyle", "openingBalance", "openingCost", "monthlyPlan", "targetAmount", "payFromAccountId", "statementDay", "autopay", "startDate"] as const;
const CATEGORY_FIELDS = ["kind", "name", "monthlyBudget", "icon"] as const;

export async function setupAction(): Promise<FormState> {
  const { id: userId } = await requireModule("savings");
  return attempt("建立預設的分類", async () => {
    const created = await setupDefaults(userId);
    if (created.categories === 0) {
      // 沒有寫入就不失效 但別的分頁早就建好時這頁還留著開始使用 要重新算繪才會換掉
      refresh();
      return "分類已經有了，沒有再新增";
    }
    updateTags(savingsTags.categories);
    return `已建立 ${created.categories} 個分類`;
  });
}

export async function createAccountAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { id: userId } = await requireModule("savings");
  return attempt("新增帳戶", async () => {
    const account = await createAccount(userId, readFields(formData, ACCOUNT_FIELDS));
    updateTags(savingsTags.accounts);
    return `已新增帳戶「${account.name}」`;
  });
}

export async function updateAccountAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { id: userId } = await requireModule("savings");
  const id = formId(formData, "id");
  if (id === null) return { error: INVALID_FORM_MESSAGE };
  return attempt("儲存帳戶", async () => {
    const account = await updateAccount(userId, id, readFields(formData, ACCOUNT_FIELDS));
    updateTags(savingsTags.accounts);
    return `已儲存「${account.name}」`;
  });
}

/** 每個帳戶一個 accountId 欄位 金額欄位的名稱帶上它 例如 monthlyPlan:3 */
export async function updateAllocationAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { id: userId } = await requireModule("savings");
  const lines = formData.getAll("accountId").map((raw) => {
    const accountId = String(raw);
    return { accountId, monthlyPlan: formText(formData, `monthlyPlan:${accountId}`), targetAmount: formText(formData, `targetAmount:${accountId}`) };
  });
  if (lines.length === 0) return { error: INVALID_FORM_MESSAGE };
  return attempt("更新分配", async () => {
    await updateAllocation(userId, lines);
    updateTags(savingsTags.accounts);
    return "已更新分配";
  });
}

export async function setAccountActiveAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { id: userId } = await requireModule("savings");
  return setActive(formData, (active) => (active ? "恢復帳戶" : "停用帳戶"), (id, active) => setAccountActive(userId, id, active), savingsTags.accounts);
}

export async function moveAccountAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { id: userId } = await requireModule("savings");
  return move(formData, (id, direction) => moveAccount(userId, id, direction), savingsTags.accounts);
}

export async function deleteAccountAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { id: userId } = await requireModule("savings");
  // 紀錄 固定收支 持股與帳單跟著刪 轉帳的另一邊也是
  return remove(formData, "刪除帳戶", (id) => deleteAccount(userId, id), [savingsTags.accounts, savingsTags.transactions, savingsTags.recurring, savingsTags.holdings, savingsTags.bills]);
}

export async function createCategoryAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { id: userId } = await requireModule("savings");
  return attempt("新增分類", async () => {
    const category = await createCategory(userId, readFields(formData, CATEGORY_FIELDS));
    updateTags(savingsTags.categories);
    return `已新增分類「${category.name}」`;
  });
}

export async function updateCategoryAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { id: userId } = await requireModule("savings");
  const id = formId(formData, "id");
  if (id === null) return { error: INVALID_FORM_MESSAGE };
  return attempt("儲存分類", async () => {
    const category = await updateCategory(userId, id, readFields(formData, CATEGORY_FIELDS));
    updateTags(savingsTags.categories);
    return `已儲存「${category.name}」`;
  });
}

export async function moveCategoryAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { id: userId } = await requireModule("savings");
  return move(formData, (id, direction) => moveCategory(userId, id, direction), savingsTags.categories);
}

export async function deleteCategoryAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { id: userId } = await requireModule("savings");
  // 紀錄與固定收支改成未分類
  return remove(formData, "刪除分類", (id) => deleteCategory(userId, id), [savingsTags.categories, savingsTags.transactions, savingsTags.recurring]);
}
