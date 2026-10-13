"use client";

import type { ReactNode } from "react";
import { Dialog, DialogButton, DialogMessage, useDialog, useDialogForm } from "@/core/ui/dialog";
import { FormFeedback } from "@/core/ui/form-message";
import { Icon } from "@/core/ui/icon";
import { MAX_AMOUNT } from "../../lib/money";
import { formatMonth } from "../../lib/month";
import { NOTE_MAX_LENGTH } from "../../lib/validation";
import { addEntryAction } from "../actions";

const AMOUNT_INPUT = { type: "number", inputMode: "numeric", required: true, min: 1, max: MAX_AMOUNT, step: 1 } as const;

type Done = { onDone: (message: string | undefined) => void; onCancel: () => void };

type GoalEntryRowProps = {
  goalId: number;
  goalName: string;
  month: string;
  /** 預設帶入還差的金額：存過一部分時不用自己算 */
  defaultAmount: number;
  /** 已經存滿的項目不放「記一筆」 */
  canRecord: boolean;
  /** 靠右對齊的每月金額，由伺服器算繪好傳進來 */
  amount: ReactNode;
  /** 名稱與狀態標籤，由伺服器算繪好傳進來 */
  children: ReactNode;
};

/** 項目清單的一列：平常只有名稱、狀態與金額，按「記一筆」才打開輸入的視窗；成功訊息留在這一列下面，記滿後按鈕消失時焦點落在訊息上 */
export function GoalEntryRow({ goalId, goalName, month, defaultAmount, canRecord, amount, children }: GoalEntryRowProps) {
  const entry = useDialog();

  return (
    <div className="stack">
      {/* 金額固定在最右欄，不論有沒有「記一筆」都對齊；手機上按鈕換到名稱下面 */}
      <div className="grid min-h-11 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">{children}</div>
        <span className="w-32 text-right sm:col-start-3">{amount}</span>
        {canRecord && (
          <button {...entry.triggerProps} className="btn-secondary col-span-2 justify-self-start sm:col-span-1 sm:col-start-2 sm:row-start-1">
            <Icon name="plus" className="size-4" />
            記一筆
          </button>
        )}
      </div>
      <DialogMessage {...entry.messageProps} />
      <Dialog {...entry.dialogProps} title={`記一筆：${goalName}`} icon={<Icon name="piggy-bank" />} size="sm">
        <RecordGoalForm goalId={goalId} month={month} defaultAmount={defaultAmount} onDone={entry.done} onCancel={entry.close} />
      </Dialog>
    </div>
  );
}

/** 標籤寫出記到哪個月：補記過去的月份時不會誤以為是這個月 */
export function RecordGoalForm({ goalId, month, defaultAmount, onDone, onCancel }: { goalId: number; month: string; defaultAmount: number } & Done) {
  const { state, pending, formProps } = useDialogForm(addEntryAction, onDone);

  return (
    <form {...formProps} className="stack">
      <input type="hidden" name="goalId" value={goalId} />
      <input type="hidden" name="month" value={month} />
      <label className="field">
        <span className="field-label">{formatMonth(month)}存的金額（元）</span>
        <input name="amount" {...AMOUNT_INPUT} defaultValue={defaultAmount} data-autofocus className="input text-right tabular-nums" />
      </label>
      {!pending && <FormFeedback state={{ error: state.error }} />}
      <FormButtons pending={pending} onCancel={onCancel} />
    </form>
  );
}

/** 不屬於任何項目的錢：平常只有一個按鈕，按了才打開輸入的視窗 */
export function TemporaryEntry({ month }: { month: string }) {
  return (
    <div className="button-row">
      <DialogButton
        label={
          <>
            <Icon name="plus" className="size-4" />
            臨時存款
          </>
        }
        title="臨時存款"
        icon={<Icon name="coins" />}
        size="sm"
      >
        {({ done, close }) => <TemporaryEntryForm month={month} onDone={done} onCancel={close} />}
      </DialogButton>
    </div>
  );
}

export function TemporaryEntryForm({ month, onDone, onCancel }: { month: string } & Done) {
  const { state, pending, formProps } = useDialogForm(addEntryAction, onDone);

  return (
    <form {...formProps} className="stack">
      <input type="hidden" name="month" value={month} />
      <p className="text-ink-soft">不屬於固定項目的錢，記在 {formatMonth(month)}。</p>
      <label className="field">
        <span className="field-label">金額（元）</span>
        <input name="amount" {...AMOUNT_INPUT} placeholder="1000" data-autofocus className="input text-right tabular-nums" />
      </label>
      <label className="field">
        <span className="field-label">備註（選填）</span>
        <input name="note" maxLength={NOTE_MAX_LENGTH} placeholder="例如：發票中獎" className="input" />
      </label>
      {!pending && <FormFeedback state={{ error: state.error }} />}
      <FormButtons pending={pending} onCancel={onCancel} />
    </form>
  );
}

function FormButtons({ pending, onCancel }: { pending: boolean; onCancel: () => void }) {
  return (
    <div className="button-row justify-end">
      <button type="button" onClick={onCancel} disabled={pending} className="btn-ghost">
        取消
      </button>
      <button disabled={pending} className="btn-primary">
        <Icon name="check" className="size-4" />
        {pending ? "記錄中…" : "記錄"}
      </button>
    </div>
  );
}
