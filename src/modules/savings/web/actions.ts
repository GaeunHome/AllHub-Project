"use server";

import { refresh } from "next/cache";
import { requireSession } from "@/core/auth";
import { updateTags, type CacheTag } from "@/core/cache";
import { INVALID_FORM_MESSAGE, formFlag, formId, formText, runAction } from "@/core/form";
import type { FormState } from "@/core/ui/form-message";
import { TRANSACTION_KIND_LABELS, type AccountKind, type TransactionKind } from "../lib/kinds";
import { balanceFromFigure } from "../lib/ledger";
import { formatSignedTwd, formatTwd } from "../lib/money";
import type { Direction } from "../lib/order";
import { amountFromText } from "../lib/validation";
import { createAccount, deleteAccount, listAccounts, moveAccount, setAccountActive, updateAccount } from "../service/accounts";
import { savingsTags } from "../service/cache-tags";
import { createCategory, deleteCategory, listCategories, moveCategory, updateCategory } from "../service/categories";
import { SavingsUserError } from "../service/errors";
import { createPurpose, deletePurpose, movePurpose, updatePurpose } from "../service/purposes";
import { createRecurring, deleteRecurring, setRecurringActive, updateRecurring } from "../service/recurring";
import { setupDefaults } from "../service/setup";
import { addTransaction, allocateSalary, deleteTransaction, updateBalance, updateTransaction } from "../service/transactions";
import { scheduleLabel } from "./entry-display";
import { balanceChangeText } from "./form-math";

// 表單的 id 只決定操作哪一筆 一律用登入者的 id 呼叫 service
// 欄位名稱跟 service 一樣 原樣交給 service 驗證

const ACCOUNT_FIELDS = ["name", "kind", "purposeId", "openingBalance", "openingCost", "monthlyPlan", "targetAmount", "dueDay", "payFromAccountId"] as const;
const PURPOSE_FIELDS = ["name", "color"] as const;
const CATEGORY_FIELDS = ["kind", "name", "color", "monthlyBudget"] as const;
const ENTRY_FIELDS = ["kind", "accountId", "counterAccountId", "categoryId", "amount", "date", "note"] as const;
const RECURRING_FIELDS = ["kind", "accountId", "counterAccountId", "categoryId", "amount", "dayOfMonth", "note"] as const;
const SALARY_FIELDS = ["accountId", "categoryId", "amount", "date", "note"] as const;

function readFields<K extends string>(formData: FormData, names: readonly K[]): Record<K, string> {
  return Object.fromEntries(names.map((name) => [name, formText(formData, name)])) as Record<K, string>;
}

function formDirection(formData: FormData): Direction | null {
  const direction = formData.get("direction");
  return direction === "up" || direction === "down" ? direction : null;
}

// 寫入都是單一指令或交易 不會只寫一半 所以成功之後才讓 tag 失效
const attempt = (action: string, work: () => Promise<FormState | string | void>) =>
  runAction({ module: "savings", action }, (error) => error instanceof SavingsUserError, work);

type Names = { account: (id: number | null) => string; category: (id: number | null) => string | null };

// 寫入前先讀好 寫入後才讀又讀不到的話 已經記好的帳會被說成失敗
async function readNames(userId: string, withCategories = true): Promise<Names> {
  const [accounts, categories] = await Promise.all([listAccounts(userId), withCategories ? listCategories(userId) : []]);
  const accountNames = new Map(accounts.map((account) => [account.id, account.name]));
  const categoryNames = new Map(categories.map((category) => [category.id, category.name]));
  return {
    account: (id) => (id === null ? undefined : accountNames.get(id)) ?? "帳戶",
    category: (id) => (id === null ? null : (categoryNames.get(id) ?? null)),
  };
}

type EntryShape = { kind: TransactionKind; accountId: number; counterAccountId: number | null; categoryId: number | null; amount: number; note: string | null };

/** 沒有分類時跟紀錄那一列一樣用備註當名稱 也沒有備註就用收支類型 */
function describeEntry(entry: EntryShape, names: Names): string {
  if (entry.kind === "transfer") return `${names.account(entry.accountId)} → ${names.account(entry.counterAccountId)} ${formatTwd(entry.amount)}`;
  const label = names.category(entry.categoryId) ?? entry.note ?? TRANSACTION_KIND_LABELS[entry.kind];
  const amount = entry.kind === "income" ? formatSignedTwd(entry.amount) : formatTwd(entry.amount);
  return `${label} ${amount}（${names.account(entry.accountId)}）`;
}

async function move(formData: FormData, run: (id: number, direction: Direction) => Promise<void>, tag: CacheTag): Promise<FormState> {
  const id = formId(formData, "id");
  const direction = formDirection(formData);
  if (id === null || direction === null) return { error: INVALID_FORM_MESSAGE };
  return attempt("調整順序", async () => {
    await run(id, direction);
    updateTags(tag);
  });
}

async function setActive(formData: FormData, label: (active: boolean) => string, run: (id: number, active: boolean) => Promise<void>, tag: CacheTag): Promise<FormState> {
  const id = formId(formData, "id");
  const active = formFlag(formData, "active");
  if (id === null || active === null) return { error: INVALID_FORM_MESSAGE };
  return attempt(label(active), async () => {
    await run(id, active);
    updateTags(tag);
  });
}

/**
 * 已經不在時沒有寫入也不失效快取 例如別的裝置刪掉了
 * 但畫面上還有那一列 要重新算繪才會消失
 */
async function remove(formData: FormData, action: string, run: (id: number) => Promise<string | boolean | null>, tags: CacheTag[]): Promise<FormState> {
  const id = formId(formData, "id");
  if (id === null) return { error: INVALID_FORM_MESSAGE };
  return attempt(action, async () => {
    const removed = await run(id);
    if (removed === null || removed === false) {
      refresh();
      return;
    }
    updateTags(...tags);
    if (typeof removed === "string") return `已刪除「${removed}」`;
  });
}

export async function setupAction(): Promise<FormState> {
  const { id: userId } = await requireSession();
  return attempt("建立預設的用途與分類", async () => {
    const created = await setupDefaults(userId);
    if (created.purposes === 0 && created.categories === 0) {
      // 沒有寫入就不失效 但別的分頁早就建好時這頁還留著開始使用 要重新算繪才會換掉
      refresh();
      return "用途和分類都已經有了，沒有再新增";
    }
    updateTags(savingsTags.purposes, savingsTags.categories);
    const parts = [created.purposes > 0 && `${created.purposes} 個用途`, created.categories > 0 && `${created.categories} 個分類`].filter(Boolean);
    return `已建立 ${parts.join("、")}`;
  });
}

export async function createAccountAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { id: userId } = await requireSession();
  return attempt("新增帳戶", async () => {
    const account = await createAccount(userId, readFields(formData, ACCOUNT_FIELDS));
    updateTags(savingsTags.accounts);
    return `已新增帳戶「${account.name}」`;
  });
}

export async function updateAccountAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { id: userId } = await requireSession();
  const id = formId(formData, "id");
  if (id === null) return { error: INVALID_FORM_MESSAGE };
  return attempt("儲存帳戶", async () => {
    const account = await updateAccount(userId, id, readFields(formData, ACCOUNT_FIELDS));
    updateTags(savingsTags.accounts);
    return `已儲存「${account.name}」`;
  });
}

export async function setAccountActiveAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { id: userId } = await requireSession();
  return setActive(formData, (active) => (active ? "恢復帳戶" : "停用帳戶"), (id, active) => setAccountActive(userId, id, active), savingsTags.accounts);
}

export async function moveAccountAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { id: userId } = await requireSession();
  return move(formData, (id, direction) => moveAccount(userId, id, direction), savingsTags.accounts);
}

export async function deleteAccountAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { id: userId } = await requireSession();
  // 紀錄與固定收支跟著刪 轉帳的另一邊也是
  return remove(formData, "刪除帳戶", (id) => deleteAccount(userId, id), [savingsTags.accounts, savingsTags.transactions, savingsTags.recurring]);
}

export async function createPurposeAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { id: userId } = await requireSession();
  return attempt("新增用途", async () => {
    const purpose = await createPurpose(userId, readFields(formData, PURPOSE_FIELDS));
    updateTags(savingsTags.purposes);
    return `已新增用途「${purpose.name}」`;
  });
}

export async function updatePurposeAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { id: userId } = await requireSession();
  const id = formId(formData, "id");
  if (id === null) return { error: INVALID_FORM_MESSAGE };
  return attempt("儲存用途", async () => {
    const purpose = await updatePurpose(userId, id, readFields(formData, PURPOSE_FIELDS));
    updateTags(savingsTags.purposes);
    return `已儲存「${purpose.name}」`;
  });
}

export async function movePurposeAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { id: userId } = await requireSession();
  return move(formData, (id, direction) => movePurpose(userId, id, direction), savingsTags.purposes);
}

export async function deletePurposeAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { id: userId } = await requireSession();
  // 用了這個用途的帳戶改成未設定
  return remove(formData, "刪除用途", (id) => deletePurpose(userId, id), [savingsTags.purposes, savingsTags.accounts]);
}

export async function createCategoryAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { id: userId } = await requireSession();
  return attempt("新增分類", async () => {
    const category = await createCategory(userId, readFields(formData, CATEGORY_FIELDS));
    updateTags(savingsTags.categories);
    return `已新增分類「${category.name}」`;
  });
}

export async function updateCategoryAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { id: userId } = await requireSession();
  const id = formId(formData, "id");
  if (id === null) return { error: INVALID_FORM_MESSAGE };
  return attempt("儲存分類", async () => {
    const category = await updateCategory(userId, id, readFields(formData, CATEGORY_FIELDS));
    updateTags(savingsTags.categories);
    return `已儲存「${category.name}」`;
  });
}

export async function moveCategoryAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { id: userId } = await requireSession();
  return move(formData, (id, direction) => moveCategory(userId, id, direction), savingsTags.categories);
}

export async function deleteCategoryAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { id: userId } = await requireSession();
  // 紀錄與固定收支改成未分類
  return remove(formData, "刪除分類", (id) => deleteCategory(userId, id), [savingsTags.categories, savingsTags.transactions, savingsTags.recurring]);
}

export async function addTransactionAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { id: userId } = await requireSession();
  return attempt("記帳", async () => {
    const names = await readNames(userId);
    const entry = await addTransaction(userId, readFields(formData, ENTRY_FIELDS));
    updateTags(savingsTags.transactions);
    return `${entry.kind === "transfer" ? "已轉帳" : "已記錄"}：${describeEntry(entry, names)}`;
  });
}

export async function updateTransactionAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { id: userId } = await requireSession();
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
  const { id: userId } = await requireSession();
  return remove(formData, "刪除紀錄", (id) => deleteTransaction(userId, id), [savingsTags.transactions]);
}

const FIGURE_NAMES: Record<AccountKind, string> = { deposit: "餘額", investment: "市值", credit: "未繳" };

export async function updateBalanceAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { id: userId } = await requireSession();
  return attempt("更新餘額", async () => {
    const actual = formText(formData, "actual");
    const { account, delta } = await updateBalance(userId, { accountId: formText(formData, "accountId"), actual });
    // 跟記錄的一樣時 service 不寫入 畫面也不必重算
    if (delta === 0) return `「${account.name}」的${FIGURE_NAMES[account.kind]}沒有變`;
    updateTags(savingsTags.transactions);
    // service 已經用同一套規則接受這個數字
    // 信用卡的訊息要寫出前後的未繳 所以從輸入與差額倒算原本的餘額
    const figure = amountFromText(actual, { allowNegative: account.kind === "credit" });
    const change = figure === null ? null : balanceChangeText(account.kind, balanceFromFigure(account.kind, figure) - delta, figure);
    return `已更新「${account.name}」：${change ?? `調整 ${formatSignedTwd(delta)}`}`;
  });
}

/** 轉出的帳戶與金額每個帳戶一組 數量對不上就是表單被改過 */
export async function allocateSalaryAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { id: userId } = await requireSession();
  const accountIds = formData.getAll("transferAccountId").map(String);
  const amounts = formData.getAll("transferAmount").map(String);
  if (accountIds.length !== amounts.length) return { error: INVALID_FORM_MESSAGE };
  // 清空的分配欄位當成不轉 不讓整張表單因為請輸入金額而失敗
  const transfers = accountIds.map((accountId, i) => ({ accountId, amount: amounts[i].trim() === "" ? "0" : amounts[i] }));
  return attempt("發薪分配", async () => {
    const names = await readNames(userId, false);
    const result = await allocateSalary(userId, { ...readFields(formData, SALARY_FIELDS), transfers });
    updateTags(savingsTags.transactions);
    const salary = formatTwd(result.income.amount);
    const receiving = names.account(result.income.accountId);
    if (result.transfers.length === 0) return `已記錄薪水 ${salary}，全部留在「${receiving}」`;
    return `已記錄薪水 ${salary}，轉出 ${result.transfers.length} 筆，「${receiving}」留下 ${formatTwd(result.remainder)}`;
  });
}

export async function createRecurringAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { id: userId } = await requireSession();
  return attempt("新增固定收支", async () => {
    const names = await readNames(userId);
    const rule = await createRecurring(userId, readFields(formData, RECURRING_FIELDS));
    updateTags(savingsTags.recurring);
    return `已新增固定收支：${scheduleLabel(rule.dayOfMonth)} ${describeEntry(rule, names)}`;
  });
}

export async function updateRecurringAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { id: userId } = await requireSession();
  const id = formId(formData, "id");
  if (id === null) return { error: INVALID_FORM_MESSAGE };
  return attempt("儲存固定收支", async () => {
    const names = await readNames(userId);
    const rule = await updateRecurring(userId, id, readFields(formData, RECURRING_FIELDS));
    updateTags(savingsTags.recurring);
    return `已儲存固定收支：${scheduleLabel(rule.dayOfMonth)} ${describeEntry(rule, names)}`;
  });
}

export async function setRecurringActiveAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { id: userId } = await requireSession();
  return setActive(formData, (active) => (active ? "恢復固定收支" : "停用固定收支"), (id, active) => setRecurringActive(userId, id, active), savingsTags.recurring);
}

export async function deleteRecurringAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { id: userId } = await requireSession();
  // 自動記的紀錄留著 但 recurring_id 改成 null 紀錄上的自動標籤跟著拿掉
  return remove(formData, "刪除固定收支", (id) => deleteRecurring(userId, id), [savingsTags.recurring, savingsTags.transactions]);
}
