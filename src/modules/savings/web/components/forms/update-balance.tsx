"use client";

import { useState } from "react";
import { Dialog, DialogMessage, useDialog, useDialogForm } from "@/core/ui/dialog";
import { FormFeedback } from "@/core/ui/form-message";
import { Icon } from "@/core/ui/icon";
import type { AccountKind } from "../../../lib/kinds";
import { shownFigure } from "../../../lib/ledger";
import { updateBalanceAction } from "../../actions";
import { balanceHint, figureText } from "../../form-math";
import { AmountField, FormButtons, ROW_MESSAGE_CLASS } from "./fields";

export type UpdateBalanceButtonProps = {
  /** balance 是目前算出來的餘額 信用卡是負的 */
  account: { id: number; name: string; kind: AccountKind; balance: number };
};

const BALANCE_FIGURE_LABELS: Record<AccountKind, string> = { deposit: "餘額", investment: "目前市值", credit: "目前未繳" };

/** 輸入銀行 App 上的數字 差額記成調整 */
export function UpdateBalanceButton({ account }: UpdateBalanceButtonProps) {
  const dialog = useDialog();

  return (
    <>
      <button {...dialog.triggerProps} aria-label={`更新餘額：${account.name}`} className="btn-secondary btn-sm">
        <Icon name="scale" className="size-4" />
        更新餘額
      </button>
      <DialogMessage {...dialog.messageProps} className={ROW_MESSAGE_CLASS} />
      <Dialog {...dialog.dialogProps} title={`更新「${account.name}」`} icon={<Icon name="scale" />} size="sm">
        <BalanceForm account={account} onDone={dialog.done} onCancel={dialog.close} />
      </Dialog>
    </>
  );
}

function BalanceForm({ account, onDone, onCancel }: { account: UpdateBalanceButtonProps["account"]; onDone: (message: string | undefined) => void; onCancel: () => void }) {
  const { state, pending, formProps } = useDialogForm(updateBalanceAction, onDone);
  const [text, setText] = useState("");
  const label = BALANCE_FIGURE_LABELS[account.kind];
  const current = shownFigure(account.kind, account.balance);
  const credit = account.kind === "credit";

  return (
    <form {...formProps} className="stack">
      <input type="hidden" name="accountId" value={account.id} />
      <dl className="panel flex items-center justify-between gap-4">
        <dt className="text-ink">記錄上的{label}</dt>
        <dd className="text-lg font-semibold text-ink tabular-nums">{figureText(account.kind, current)}</dd>
      </dl>
      <AmountField
        name="actual"
        label={`銀行 App 上的${label}（元）`}
        value={text}
        onValueChange={setText}
        required
        autoFocus
        large
        placeholder={String(current)}
        allowNegative={credit}
        hint={
          <>
            {balanceHint(account.kind, account.balance, text)}
            {credit && <span className="block">多繳（溢繳）時填負數，例如 -200。</span>}
          </>
        }
      />
      {!pending && <FormFeedback state={{ error: state.error }} />}
      <FormButtons pending={pending} onCancel={onCancel} label="更新" pendingLabel="更新中…" />
    </form>
  );
}
