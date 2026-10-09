"use client";

import { useActionState } from "react";
import { FormFeedback } from "@/core/ui/form-message";
import { Icon } from "@/core/ui/icon";
import { MAX_AMOUNT } from "../../lib/money";
import { NAME_MAX_LENGTH, NOTE_MAX_LENGTH } from "../../lib/validation";
import { createGoalAction, updateGoalAction, type FormState } from "../actions";

export type GoalDraft = { id: number; name: string; monthlyAmount: number; note: string | null };

// 瀏覽器先擋掉明顯的錯（空白、小數、負數），伺服器端仍會再驗一次
function GoalFields({ goal }: { goal?: GoalDraft }) {
  return (
    <div className="grid gap-4 sm:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <label className="field">
        <span className="field-label">名稱</span>
        <input name="name" required maxLength={NAME_MAX_LENGTH} defaultValue={goal?.name} placeholder="例如：緊急預備金、旅遊基金" className="input" />
      </label>
      <label className="field">
        <span className="field-label">每月金額（元）</span>
        <input
          name="monthlyAmount"
          type="number"
          inputMode="numeric"
          required
          min={1}
          max={MAX_AMOUNT}
          step={1}
          defaultValue={goal?.monthlyAmount}
          placeholder="5000"
          className="input text-right tabular-nums"
        />
      </label>
      <label className="field sm:col-span-2">
        <span className="field-label">備註（選填）</span>
        <input name="note" maxLength={NOTE_MAX_LENGTH} defaultValue={goal?.note ?? ""} placeholder="例如：存到半年生活費為止" className="input" />
      </label>
    </div>
  );
}

export function AddGoalForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(createGoalAction, {});

  return (
    <form action={action} className="panel-outline stack">
      <h3 className="flex items-center gap-2 font-semibold text-ink">
        <Icon name="plus" className="size-5 text-accent" />
        新增固定項目
      </h3>
      <GoalFields />
      <div className="button-row">
        <button disabled={pending} className="btn-primary">
          <Icon name="plus" className="size-4" />
          {pending ? "新增中…" : "新增項目"}
        </button>
        {!pending && <FormFeedback state={state} />}
      </div>
    </form>
  );
}

export function EditGoalForm({ goal, onClose }: { goal: GoalDraft; onClose: () => void }) {
  const [state, action, pending] = useActionState<FormState, FormData>(async (previous, formData) => {
    const result = await updateGoalAction(previous, formData);
    if (!result.error) onClose();
    return result;
  }, {});

  return (
    <form action={action} className="panel stack">
      <input type="hidden" name="goalId" value={goal.id} />
      <GoalFields goal={goal} />
      <div className="button-row">
        <button disabled={pending} className="btn-primary">
          <Icon name="check" className="size-4" />
          {pending ? "儲存中…" : "儲存"}
        </button>
        <button type="button" onClick={onClose} disabled={pending} className="btn-ghost">
          取消
        </button>
        {!pending && <FormFeedback state={state} />}
      </div>
    </form>
  );
}
