"use client";

import { useDialogForm } from "@/core/ui/dialog";
import { FormButtons } from "@/core/ui/form-buttons";
import { FormFeedback } from "@/core/ui/form-message";
import type { TripMember } from "../../service/trips";
import { recordRepaymentAction } from "../actions";
import type { TransferRow } from "../expense-view";

type RepaymentFormProps = { tripId: number; userId: string; people: TripMember[]; transfers: TransferRow[]; onDone: (message: string | undefined) => void; onCancel: () => void };

/** 參考分帳龍寶寶的還款 任意金額 先填自己要給的那一筆 沒有就填第一筆 */
export function RepaymentForm({ tripId, userId, people, transfers, onDone, onCancel }: RepaymentFormProps) {
  const { state, pending, formProps } = useDialogForm(recordRepaymentAction, onDone);
  const suggested = transfers.find(({ from }) => from === userId) ?? transfers[0];
  const other = people.find(({ id }) => id !== userId)?.id ?? userId;
  const select = (name: "from" | "to", label: string, value: string) => (
    <label className="field">
      <span className="field-label">{label}</span>
      <select name={name} defaultValue={value} className="input">
        {people.map((person) => (
          <option key={person.id} value={person.id}>
            {person.name}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <form {...formProps} className="stack">
      <input type="hidden" name="tripId" value={tripId} />
      <div className="grid grid-cols-2 gap-4">
        {select("from", "誰給", suggested?.from ?? userId)}
        {select("to", "給誰", suggested?.to ?? other)}
      </div>
      <label className="field">
        <span className="field-label">台幣金額</span>
        <input name="amount" required inputMode="numeric" defaultValue={suggested?.amount ?? ""} autoComplete="off" data-autofocus className="input tabular-nums" />
      </label>
      {!pending && <FormFeedback state={{ error: state.error }} />}
      <FormButtons pending={pending} onCancel={onCancel} />
    </form>
  );
}
