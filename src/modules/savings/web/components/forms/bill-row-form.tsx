"use client";

import { useState } from "react";
import { InfoTip } from "@/core/ui/info-tip";
import { useDialogForm } from "@/core/ui/dialog";
import { FormButtons } from "@/core/ui/form-buttons";
import { FormFeedback } from "@/core/ui/form-message";
import { updateTransactionAction } from "../../actions";
import { CategoryChips, NoteField } from "./fields";
import type { CategoryOption } from "./options";

type BillRow = { id: number; accountId: number; categoryId: number | null; amount: number; date: string; note: string | null };

type BillRowFormProps = {
  record: BillRow;
  categories: readonly CategoryOption[];
  onDone: (message: string | undefined) => void;
  onCancel: () => void;
};

/**
 * 填帳單時補的刷卡 金額與日期跟帳單綁在一起 只能改分類與備註
 * 其他欄位原樣送回 伺服器確認沒有改動
 */
export function BillRowForm({ record, categories, onDone, onCancel }: BillRowFormProps) {
  const { state, pending, formProps } = useDialogForm(updateTransactionAction, onDone);
  const [categoryId, setCategoryId] = useState(record.categoryId);

  return (
    <form {...formProps} className="stack">
      <input type="hidden" name="id" value={record.id} />
      <input type="hidden" name="kind" value="expense" />
      <input type="hidden" name="accountId" value={record.accountId} />
      <input type="hidden" name="counterAccountId" value="" />
      <input type="hidden" name="amount" value={record.amount} />
      <input type="hidden" name="date" value={record.date} />
      <CategoryChips categories={categories.filter((category) => category.kind === "expense")} value={categoryId} onChange={setCategoryId} />
      <NoteField defaultValue={record.note} />
      <p className="flex items-center gap-1 text-sm font-medium text-ink">
        金額不能在這裡改
        <InfoTip label="金額不能在這裡改的原因">要改金額，請重填這一期的帳單。</InfoTip>
      </p>
      {!pending && <FormFeedback state={{ error: state.error }} />}
      <FormButtons pending={pending} onCancel={onCancel} label="儲存" pendingLabel="儲存中…" />
    </form>
  );
}
