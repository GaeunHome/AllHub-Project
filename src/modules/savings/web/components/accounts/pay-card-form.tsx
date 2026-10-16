"use client";

import { useDialogForm } from "@/core/ui/dialog";
import { FormFeedback } from "@/core/ui/form-message";
import type { DateKey } from "../../../lib/dates";
import { payCardAction } from "../../actions";
import type { PayCardDraft } from "../../dashboard-view";
import { pickAccount } from "../../last-used";
import { AccountSelect, AmountField, DateField, FormButtons } from "../forms/fields";
import type { AccountOption } from "../forms/options";

type PayCardFormProps = {
  draft: PayCardDraft;
  /** 啟用中的存款帳戶 預設是這張卡的扣款帳戶 */
  accounts: AccountOption[];
  today: DateKey;
  onDone: (message: string | undefined) => void;
  onCancel: () => void;
};

/** 記成從存款帳戶轉到這張卡 金額先填本期應繳 可以改 */
export function PayCardForm({ draft, accounts, today, onDone, onCancel }: PayCardFormProps) {
  const { state, pending, formProps } = useDialogForm(payCardAction, onDone);

  return (
    <form {...formProps} className="stack">
      <input type="hidden" name="cardId" value={draft.cardId} />
      <AmountField name="amount" label="繳款金額（元）" defaultValue={draft.amount > 0 ? draft.amount : null} required autoFocus large />
      <div className="grid gap-4 sm:grid-cols-2">
        <AccountSelect name="fromAccountId" label="從哪個帳戶繳" accounts={accounts} defaultValue={pickAccount(accounts, draft.payFromAccountId)} />
        <DateField defaultValue={today} today={today} min={draft.minDate} />
      </div>
      {!pending && <FormFeedback state={{ error: state.error }} />}
      <FormButtons pending={pending} onCancel={onCancel} label="已繳" pendingLabel="記錄中…" />
    </form>
  );
}
