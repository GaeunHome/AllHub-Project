"use server";

import { requireModule } from "@/core/auth";
import { updateTags } from "@/core/cache";
import type { FormState } from "@/core/ui/form-message";
import { formatSlashDate } from "../lib/dates";
import { formatTwd } from "../lib/money";
import { savingsTags } from "../service/cache-tags";
import { enterCardBill, payCard } from "../service/cards";
import { attempt, readFields } from "./action-helpers";

// 信用卡的填帳單與已繳

const PAY_CARD_FIELDS = ["cardId", "fromAccountId", "amount", "date", "billAmount", "dueDate", "categoryId"] as const;
const CARD_BILL_FIELDS = ["cardId", "amount", "statementDate", "dueDate", "categoryId"] as const;

/** 帳單跟紀錄差多少 補了什麼要寫出來 不然紀錄頁多一筆會看不懂 */
function billDifferenceText(difference: number): string {
  if (difference > 0) return `，補記未記錄的刷卡 ${formatTwd(difference)}`;
  if (difference < 0) return `，帳上多記的 ${formatTwd(0 - difference)} 已調整`;
  return "，跟紀錄一樣";
}

export async function enterCardBillAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { id: userId } = await requireModule("savings");
  return attempt("填帳單", async () => {
    const { bill, card, difference } = await enterCardBill(userId, readFields(formData, CARD_BILL_FIELDS));
    updateTags(savingsTags.bills, savingsTags.transactions);
    return `已記下${card.name} ${formatSlashDate(bill.statementDate)} 結帳的帳單 ${formatTwd(bill.amount)}${billDifferenceText(difference)}`;
  });
}

export async function payCardAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { id: userId } = await requireModule("savings");
  return attempt("記下繳卡費", async () => {
    const { transaction, card, bill, difference } = await payCard(userId, readFields(formData, PAY_CARD_FIELDS));
    // 一起填了帳單時帳單也變了
    updateTags(...(bill === null ? [savingsTags.transactions] : [savingsTags.bills, savingsTags.transactions]));
    // 跟按鈕一樣寫已繳
    const billed = bill === null ? "" : `，帳單 ${formatTwd(bill.amount)}${billDifferenceText(difference)}`;
    return `已繳${card.name} ${formatTwd(transaction.amount)}${billed}`;
  });
}
