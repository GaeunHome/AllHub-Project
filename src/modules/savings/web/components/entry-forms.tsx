"use client";

import { useActionState, useId, useState, type ReactNode } from "react";
import { FormFeedback, InlineFeedback } from "@/core/ui/form-message";
import { Icon } from "@/core/ui/icon";
import { MAX_AMOUNT } from "../../lib/money";
import { NOTE_MAX_LENGTH } from "../../lib/validation";
import { addEntryAction, type FormState } from "../actions";

const AMOUNT_INPUT = { type: "number", inputMode: "numeric", required: true, min: 1, max: MAX_AMOUNT, step: 1 } as const;

type Done = { onDone: (message: string | undefined) => void; onCancel: () => void };

/** 成功時收起表單、把訊息交給外層顯示；失敗時留著表單與錯誤訊息 */
function useEntryAction(onDone: Done["onDone"]) {
  return useActionState<FormState, FormData>(async (previous, formData) => {
    const result = await addEntryAction(previous, formData);
    if (!result.error) onDone(result.message);
    return result;
  }, {});
}

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

/** 項目清單的一列：平常只有名稱、狀態與金額，按「記一筆」才展開輸入框 */
export function GoalEntryRow({ goalId, goalName, month, defaultAmount, canRecord, amount, children }: GoalEntryRowProps) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState<string | undefined>();
  const formId = useId();

  return (
    <div className="stack">
      {/* 金額固定在最右欄，不論有沒有「記一筆」都對齊；手機上按鈕換到名稱下面 */}
      <div className="grid min-h-11 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">{children}</div>
        <span className="w-32 text-right sm:col-start-3">{amount}</span>
        {canRecord && (
          <button
            type="button"
            aria-expanded={open}
            aria-controls={formId}
            onClick={() => {
              setOpen((value) => !value);
              setMessage(undefined);
            }}
            className="btn-secondary col-span-2 justify-self-start sm:col-span-1 sm:col-start-2 sm:row-start-1"
          >
            <Icon name="plus" className="size-4" />
            記一筆
          </button>
        )}
      </div>
      {open && (
        <div id={formId}>
          <RecordGoalForm
            goalId={goalId}
            goalName={goalName}
            month={month}
            defaultAmount={defaultAmount}
            onDone={(text) => {
              setOpen(false);
              setMessage(text);
            }}
            onCancel={() => setOpen(false)}
          />
        </div>
      )}
      {!open && message && <InlineFeedback message={message} />}
    </div>
  );
}

function RecordGoalForm({ goalId, goalName, month, defaultAmount, onDone, onCancel }: { goalId: number; goalName: string; month: string; defaultAmount: number } & Done) {
  const [state, action, pending] = useEntryAction(onDone);

  return (
    <form action={action} className="panel flex flex-col gap-2">
      <input type="hidden" name="goalId" value={goalId} />
      <input type="hidden" name="month" value={month} />
      <div className="button-row">
        <input
          name="amount"
          {...AMOUNT_INPUT}
          defaultValue={defaultAmount}
          aria-label={`「${goalName}」這個月存的金額（元）`}
          autoFocus
          className="input w-40 text-right tabular-nums"
        />
        <button disabled={pending} className="btn-primary">
          <Icon name="check" className="size-4" />
          {pending ? "記錄中…" : "記錄"}
        </button>
        <button type="button" onClick={onCancel} disabled={pending} className="btn-ghost">
          取消
        </button>
      </div>
      {!pending && state.error && <InlineFeedback error={state.error} />}
    </form>
  );
}

/** 不屬於任何項目的錢：平常只有一個按鈕，按了才出現輸入框 */
export function TemporaryEntry({ month }: { month: string }) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState<string | undefined>();
  const formId = useId();

  return (
    <div className="stack">
      <div className="button-row">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={formId}
          onClick={() => {
            setOpen((value) => !value);
            setMessage(undefined);
          }}
          className="btn-secondary"
        >
          <Icon name="plus" className="size-4" />
          臨時存款
        </button>
        {!open && message && <InlineFeedback message={message} />}
      </div>
      {open && (
        <div id={formId}>
          <TemporaryEntryForm
            month={month}
            onDone={(text) => {
              setOpen(false);
              setMessage(text);
            }}
            onCancel={() => setOpen(false)}
          />
        </div>
      )}
    </div>
  );
}

function TemporaryEntryForm({ month, onDone, onCancel }: { month: string } & Done) {
  const [state, action, pending] = useEntryAction(onDone);

  return (
    <form action={action} className="panel flex flex-col gap-2">
      <input type="hidden" name="month" value={month} />
      <div className="button-row">
        <input name="amount" {...AMOUNT_INPUT} aria-label="臨時存款金額（元）" placeholder="金額（元）" autoFocus className="input w-40 text-right tabular-nums" />
        <input name="note" maxLength={NOTE_MAX_LENGTH} aria-label="備註（選填）" placeholder="備註（選填）" className="input min-w-40 flex-1" />
        <button disabled={pending} className="btn-primary">
          <Icon name="check" className="size-4" />
          {pending ? "記錄中…" : "記錄"}
        </button>
        <button type="button" onClick={onCancel} disabled={pending} className="btn-ghost">
          取消
        </button>
      </div>
      {!pending && <FormFeedback state={{ error: state.error }} />}
    </form>
  );
}
