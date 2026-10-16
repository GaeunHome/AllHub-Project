"use client";

import { useState } from "react";
import { Dialog, DialogMessage, useDialog, useDialogForm } from "@/core/ui/dialog";
import { FormFeedback } from "@/core/ui/form-message";
import { Icon } from "@/core/ui/icon";
import { formatTwd } from "../../../lib/money";
import { updateBalanceAction } from "../../actions";
import { balanceHint } from "../../form-math";
import { AmountField, FormButtons, ROW_MESSAGE_CLASS } from "./fields";

/** 信用卡照帳單繳 有持股的投資帳戶照股價算 都不能更新餘額 */
export type BalanceAccount = { id: number; name: string; kind: "deposit" | "investment"; balance: number };

export type UpdateBalanceButtonProps = { account: BalanceAccount };

const FIGURE_LABELS: Record<BalanceAccount["kind"], string> = { deposit: "餘額", investment: "目前市值" };

/** 輸入銀行 App 上的數字 差額記成調整 投資帳戶改的是市值 */
export function UpdateBalanceButton({ account }: UpdateBalanceButtonProps) {
  const dialog = useDialog();
  const label = account.kind === "investment" ? "更新市值" : "更新餘額";

  return (
    <>
      <button {...dialog.triggerProps} aria-label={`${label}：${account.name}`} className="btn-secondary btn-sm">
        <Icon name="scale" className="size-4" />
        {label}
      </button>
      <DialogMessage {...dialog.messageProps} className={ROW_MESSAGE_CLASS} />
      <Dialog {...dialog.dialogProps} title={`更新「${account.name}」`} size="sm">
        <UpdateBalanceForm account={account} onDone={dialog.done} onCancel={dialog.close} />
      </Dialog>
    </>
  );
}

type UpdateBalanceFormProps = { account: BalanceAccount; onDone: (message: string | undefined) => void; onCancel: () => void };

/** 視窗的內容 先選帳戶再更新的視窗也用它 */
export function UpdateBalanceForm({ account, onDone, onCancel }: UpdateBalanceFormProps) {
  const { state, pending, formProps } = useDialogForm(updateBalanceAction, onDone);
  const [text, setText] = useState("");
  const label = FIGURE_LABELS[account.kind];

  return (
    <form {...formProps} className="stack">
      <input type="hidden" name="accountId" value={account.id} />
      <dl className="panel flex items-center justify-between gap-4">
        <dt className="text-ink">記錄上的{label}</dt>
        <dd className="text-lg font-semibold text-ink tabular-nums">{formatTwd(account.balance)}</dd>
      </dl>
      <AmountField
        name="actual"
        label={`銀行 App 上的${label}（元）`}
        value={text}
        onValueChange={setText}
        required
        autoFocus
        large
        placeholder={String(account.balance)}
        hint={balanceHint(account.balance, text)}
      />
      {!pending && <FormFeedback state={{ error: state.error }} />}
      <FormButtons pending={pending} onCancel={onCancel} label="更新" pendingLabel="更新中…" />
    </form>
  );
}
