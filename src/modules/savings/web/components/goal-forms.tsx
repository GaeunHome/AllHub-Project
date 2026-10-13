"use client";

import { useLayoutEffect } from "react";
import { DialogButton, DialogMessage, returnFocusTarget, useDialog, useDialogForm } from "@/core/ui/dialog";
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
        <input name="name" required maxLength={NAME_MAX_LENGTH} defaultValue={goal?.name} data-autofocus placeholder="例如：緊急預備金、旅遊基金" className="input" />
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

/** 還沒有任何項目時直接放在清單裡的表單：成功後伺服器重新算繪、表單換成清單，訊息留在原本表單的位置（跟管理項目的新增一樣有圖示與底色，整頁只留最新一則） */
export function FirstGoalForm({ show }: { show: boolean }) {
  const { message, messageProps, done } = useDialog();

  // 表單被拿掉時，焦點（送出中停用的按鈕、或按 Enter 送出的欄位）會掉到 body：接到訊息上，報讀器也會念；焦點在別處就不搶
  useLayoutEffect(() => {
    if (show || !message) return;
    const active = document.activeElement;
    returnFocusTarget(!active || active === document.body, null, messageProps.ref.current)?.focus();
  }, [show, message, messageProps.ref]);

  if (show) return <AddGoalForm onDone={done} />;
  return <DialogMessage {...messageProps} />;
}

function AddGoalForm({ onDone }: { onDone: (message: string | undefined) => void }) {
  // 跟視窗裡的表單一樣用 onSubmit 送出：<form action> 送完一定清空欄位，失敗時打的字會不見
  const { state, pending, formProps } = useDialogForm(createGoalAction, onDone);

  return (
    <form {...formProps} className="panel-outline stack">
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
        {!pending && <FormFeedback state={{ error: state.error }} />}
      </div>
    </form>
  );
}

/** 管理項目裡的「新增固定項目」：按了才打開視窗，成功後關掉、訊息留在按鈕旁邊 */
export function AddGoalDialog() {
  return (
    <div className="button-row">
      <DialogButton
        label={
          <>
            <Icon name="plus" className="size-4" />
            新增固定項目
          </>
        }
        title="新增固定項目"
        icon={<Icon name="plus" />}
      >
        {({ done, close }) => <GoalForm action={createGoalAction} submitLabel={{ idle: "新增項目", pending: "新增中…", icon: "plus" }} onDone={done} onCancel={close} />}
      </DialogButton>
    </div>
  );
}

/** 修改項目的視窗內容：成功時由外層關掉視窗，失敗時留著錯誤訊息 */
export function EditGoalForm({ goal, onDone, onCancel }: { goal: GoalDraft; onDone: (message: string | undefined) => void; onCancel: () => void }) {
  return <GoalForm goal={goal} action={updateGoalAction} submitLabel={{ idle: "儲存", pending: "儲存中…", icon: "check" }} onDone={onDone} onCancel={onCancel} />;
}

type GoalFormProps = {
  goal?: GoalDraft;
  action: (previous: FormState, formData: FormData) => Promise<FormState>;
  submitLabel: { idle: string; pending: string; icon: "plus" | "check" };
  onDone: (message: string | undefined) => void;
  onCancel: () => void;
};

function GoalForm({ goal, action, submitLabel, onDone, onCancel }: GoalFormProps) {
  const { state, pending, formProps } = useDialogForm(action, onDone);

  return (
    <form {...formProps} className="stack">
      {goal && <input type="hidden" name="goalId" value={goal.id} />}
      <GoalFields goal={goal} />
      {!pending && <FormFeedback state={{ error: state.error }} />}
      <div className="button-row justify-end">
        <button type="button" onClick={onCancel} disabled={pending} className="btn-ghost">
          取消
        </button>
        <button disabled={pending} className="btn-primary">
          <Icon name={submitLabel.icon} className="size-4" />
          {pending ? submitLabel.pending : submitLabel.idle}
        </button>
      </div>
    </form>
  );
}
