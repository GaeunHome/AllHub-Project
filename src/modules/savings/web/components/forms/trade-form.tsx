"use client";

import { InfoTip } from "@/core/ui/info-tip";
import { useDialogForm } from "@/core/ui/dialog";
import { FormButtons } from "@/core/ui/form-buttons";
import { FormFeedback } from "@/core/ui/form-message";
import { latestOf } from "../../../lib/dates";
import { updateTransactionAction } from "../../actions-records";
import { DateField, NoteField } from "./fields";
import type { AccountOption } from "./options";

type TradeRecord = { id: number; accountId: number; counterAccountId: number | null; amount: number; date: string; note: string | null };

type TradeFormProps = {
  record: TradeRecord;
  /** 日期不能早於兩個帳戶開始記帳的那天 */
  accounts: readonly Pick<AccountOption, "id" | "startDate">[];
  today: string;
  onDone: (message: string | undefined) => void;
  onCancel: () => void;
};

/**
 * 買賣紀錄只能改日期與備註 金額與股數跟持股連在一起 要改請刪除後重記
 * 其他欄位原樣送回 伺服器確認沒有改動
 */
export function TradeForm({ record, accounts, today, onDone, onCancel }: TradeFormProps) {
  const { state, pending, formProps } = useDialogForm(updateTransactionAction, onDone);
  const startOf = (id: number | null) => accounts.find((account) => account.id === id)?.startDate;

  return (
    <form {...formProps} className="stack">
      <input type="hidden" name="id" value={record.id} />
      <input type="hidden" name="kind" value="transfer" />
      <input type="hidden" name="accountId" value={record.accountId} />
      <input type="hidden" name="counterAccountId" value={record.counterAccountId ?? ""} />
      <input type="hidden" name="categoryId" value="" />
      <input type="hidden" name="amount" value={record.amount} />
      <DateField defaultValue={record.date} today={today} min={latestOf([startOf(record.accountId), startOf(record.counterAccountId)]) ?? undefined} autoFocus />
      <NoteField defaultValue={record.note} />
      <p className="flex items-center gap-1 text-sm font-medium text-ink">
        金額與股數不能在這裡改
        <InfoTip label="金額與股數不能在這裡改的原因">要改請刪除後重記</InfoTip>
      </p>
      {!pending && <FormFeedback state={{ error: state.error }} />}
      <FormButtons pending={pending} onCancel={onCancel} label="儲存" pendingLabel="儲存中…" />
    </form>
  );
}
