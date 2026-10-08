"use client";

import { useActionState } from "react";
import { FormFeedback, InlineFeedback } from "@/core/ui/form-message";
import { Icon } from "@/core/ui/icon";
import { MAX_AMOUNT } from "../../lib/money";
import { NOTE_MAX_LENGTH } from "../../lib/validation";
import { addEntryAction, type FormState } from "../actions";

const AMOUNT_INPUT = { type: "number", inputMode: "numeric", required: true, min: 1, max: MAX_AMOUNT, step: 1 } as const;

/** 預設帶入還差的金額：存過一部分時不用自己算 */
export function RecordGoalForm({ goalId, goalName, month, defaultAmount, label }: { goalId: number; goalName: string; month: string; defaultAmount: number; label: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(addEntryAction, {});

  return (
    <form action={action} className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        <input type="hidden" name="goalId" value={goalId} />
        <input type="hidden" name="month" value={month} />
        <input
          name="amount"
          {...AMOUNT_INPUT}
          defaultValue={defaultAmount}
          aria-label={`「${goalName}」這個月存的金額（元）`}
          className="input min-h-9 w-32 py-1.5 text-sm tabular-nums"
        />
        <button disabled={pending} className="btn-primary btn-sm">
          <Icon name="check" className="size-3.5" />
          {pending ? "記錄中…" : label}
        </button>
      </div>
      <InlineFeedback error={state.error} className="text-right" />
    </form>
  );
}

export function TemporaryEntryForm({ month }: { month: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(addEntryAction, {});

  return (
    <form action={action} className="flex flex-col gap-3 border-t border-line pt-4">
      <input type="hidden" name="month" value={month} />
      <div>
        <h4 className="flex items-center gap-2 text-sm font-semibold text-ink">
          <Icon name="coins" className="size-4 text-accent" />
          新增臨時存款
        </h4>
        <p className="mt-0.5 text-xs text-muted">不屬於任何固定項目的存款，例如年終獎金、發票中獎</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <input name="amount" {...AMOUNT_INPUT} aria-label="臨時存款金額（元）" placeholder="金額（元）" className="input w-36 tabular-nums" />
        <input name="note" maxLength={NOTE_MAX_LENGTH} aria-label="備註（選填）" placeholder="備註（選填）" className="input min-w-40 flex-1" />
        <button disabled={pending} className="btn-secondary">
          <Icon name="plus" className="size-4" />
          {pending ? "記錄中…" : "記錄"}
        </button>
      </div>
      {!pending && <FormFeedback state={state} />}
    </form>
  );
}
