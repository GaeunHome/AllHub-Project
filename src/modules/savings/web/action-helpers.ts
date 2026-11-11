import "server-only";
import { refresh } from "next/cache";
import { runAction } from "@/core/action";
import { updateTags, type CacheTag } from "@/core/cache";
import { INVALID_FORM_MESSAGE, formFlag, formId, formText } from "@/core/form";
import type { FormState } from "@/core/ui/form-message";
import { TRANSACTION_KIND_LABELS, type TransactionKind } from "../lib/kinds";
import { formatTwd } from "../lib/money";
import type { Direction } from "../lib/order";
import { recurringNames, type RecurringNames } from "../lib/recurring";
import { listAccounts } from "../service/accounts";
import { listCategories } from "../service/categories";
import { listHoldings } from "../service/holdings";
import { plannedAmount } from "./format";

// 理財各個 actions*.ts 共用 這個檔不是 use server 畫面叫不到
// 表單的 id 只決定操作哪一筆 一律用登入者的 id 呼叫 service

export function readFields<K extends string>(formData: FormData, names: readonly K[]): Record<K, string> {
  return Object.fromEntries(names.map((name) => [name, formText(formData, name)])) as Record<K, string>;
}

function formDirection(formData: FormData): Direction | null {
  const direction = formData.get("direction");
  return direction === "up" || direction === "down" ? direction : null;
}

// 寫入都是單一指令或交易 不會只寫一半 所以成功之後才讓 tag 失效
export const attempt = (action: string, work: () => Promise<FormState | string | void>) => runAction({ module: "savings", action }, work);

export type Names = {
  account: (id: number | null) => string;
  category: (id: number | null) => string | null;
  maps: RecurringNames;
};

// 寫入前先讀好 寫入後才讀又讀不到的話 已經記好的帳會被說成失敗
export async function readNames(userId: string, { categories: withCategories = true, holdings: withHoldings = false } = {}): Promise<Names> {
  const [accounts, categories, holdings] = await Promise.all([listAccounts(userId), withCategories ? listCategories(userId) : [], withHoldings ? listHoldings(userId) : []]);
  const maps = recurringNames({ accounts, categories, holdings });
  return {
    account: (id) => (id === null ? undefined : maps.accounts.get(id)) ?? "帳戶",
    category: (id) => (id === null ? null : (maps.categories.get(id) ?? null)),
    maps,
  };
}

type EntryShape = { kind: TransactionKind; accountId: number; counterAccountId: number | null; categoryId: number | null; amount: number; note: string | null };

/** 沒有分類時跟紀錄那一列一樣用備註當名稱 也沒有備註就用收支類型 */
export function describeEntry(entry: EntryShape, names: Names): string {
  if (entry.kind === "transfer") return `${names.account(entry.accountId)} → ${names.account(entry.counterAccountId)} ${formatTwd(entry.amount)}`;
  const label = names.category(entry.categoryId) ?? entry.note ?? TRANSACTION_KIND_LABELS[entry.kind];
  return `${label} ${plannedAmount(entry.kind, entry.amount)}（${names.account(entry.accountId)}）`;
}

export async function move(formData: FormData, run: (id: number, direction: Direction) => Promise<void>, tag: CacheTag): Promise<FormState> {
  const id = formId(formData, "id");
  const direction = formDirection(formData);
  if (id === null || direction === null) return { error: INVALID_FORM_MESSAGE };
  return attempt("調整順序", async () => {
    await run(id, direction);
    updateTags(tag);
  });
}

export async function setActive(formData: FormData, label: (active: boolean) => string, run: (id: number, active: boolean) => Promise<void>, tag: CacheTag): Promise<FormState> {
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
export async function remove(formData: FormData, action: string, run: (id: number) => Promise<string | boolean | null>, tags: CacheTag[]): Promise<FormState> {
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
