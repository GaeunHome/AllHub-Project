"use server";

import { requireModule } from "@/core/auth";
import { updateTags } from "@/core/cache";
import { INVALID_FORM_MESSAGE, formId } from "@/core/form";
import type { FormState } from "@/core/ui/form-message";
import { formatNumber, formatTwd } from "../lib/money";
import { savingsTags } from "../service/cache-tags";
import { addHolding, buyHolding, deleteHolding, sellHolding, updateHolding } from "../service/holdings";
import { attempt, readFields, remove } from "./action-helpers";

// 持股與買進賣出

const HOLDING_FIELDS = ["accountId", "symbol", "shares", "cost"] as const;
const HOLDING_UPDATE_FIELDS = ["shares", "cost"] as const;
const BUY_FIELDS = ["holdingId", "fromAccountId", "shares", "amount", "date", "note"] as const;
const SELL_FIELDS = ["holdingId", "toAccountId", "shares", "amount", "date", "note"] as const;

export async function createHoldingAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { id: userId } = await requireModule("savings");
  return attempt("新增持股", async () => {
    const holding = await addHolding(userId, readFields(formData, HOLDING_FIELDS));
    updateTags(savingsTags.holdings);
    return `已新增持股「${holding.symbol} ${holding.name}」`;
  });
}

export async function updateHoldingAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { id: userId } = await requireModule("savings");
  const id = formId(formData, "id");
  if (id === null) return { error: INVALID_FORM_MESSAGE };
  return attempt("儲存持股", async () => {
    const holding = await updateHolding(userId, id, readFields(formData, HOLDING_UPDATE_FIELDS));
    updateTags(savingsTags.holdings);
    return `已儲存「${holding.symbol} ${holding.name}」：${formatNumber(holding.shares)} 股，總成本 ${formatTwd(holding.cost)}`;
  });
}

export async function deleteHoldingAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { id: userId } = await requireModule("savings");
  // 定期定額跟著刪 買賣紀錄留著但沒有代號了
  return remove(formData, "刪除持股", (id) => deleteHolding(userId, id), [savingsTags.holdings, savingsTags.recurring, savingsTags.transactions]);
}

export async function buyHoldingAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { id: userId } = await requireModule("savings");
  return attempt("記下買進", async () => {
    const { holding, transaction } = await buyHolding(userId, readFields(formData, BUY_FIELDS));
    updateTags(savingsTags.holdings, savingsTags.transactions);
    return `已記下買進 ${holding.symbol} ${formatNumber(transaction.shares ?? 0)} 股 ${formatTwd(transaction.amount)}`;
  });
}

export async function sellHoldingAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { id: userId } = await requireModule("savings");
  return attempt("記下賣出", async () => {
    const { holding, transaction } = await sellHolding(userId, readFields(formData, SELL_FIELDS));
    updateTags(savingsTags.holdings, savingsTags.transactions);
    return `已記下賣出 ${holding.symbol} ${formatNumber(Math.abs(transaction.shares ?? 0))} 股 ${formatTwd(transaction.amount)}`;
  });
}
