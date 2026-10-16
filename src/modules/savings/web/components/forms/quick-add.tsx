"use client";

import { Dialog, DialogMessage, useDialog } from "@/core/ui/dialog";
import { Icon } from "@/core/ui/icon";
import type { EntryKind } from "../../../lib/kinds";
import { addTransactionAction } from "../../actions";
import { EntryForm } from "./entry-form";
import { ROW_MESSAGE_CLASS } from "./fields";
import type { EntryFormOptions } from "./options";

export type QuickAddButtonProps = EntryFormOptions & {
  /** 從帳戶卡片打開時帶入這個帳戶 沒給就用上次用的 */
  accountId?: number;
  defaultKind?: EntryKind;
  /** 按鈕的字 預設是記一筆 */
  label?: string;
  /** 預設 btn-primary 帳戶卡片上用 btn-secondary btn-sm */
  className?: string;
};

/** 還沒有任何帳戶時不顯示 沒有地方可以記 */
export function QuickAddButton({ accounts, categories, today, accountId, defaultKind, label = "記一筆", className = "btn-primary" }: QuickAddButtonProps) {
  const dialog = useDialog();
  if (accounts.length === 0) return null;
  // 每張帳戶卡片都有記一筆 報讀器要分得出是哪個帳戶的
  const forAccount = accounts.find((account) => account.id === accountId);

  return (
    <>
      <button {...dialog.triggerProps} aria-label={forAccount ? `${label}：${forAccount.name}` : undefined} className={className}>
        <Icon name="plus" className="size-4" />
        {label}
      </button>
      <DialogMessage {...dialog.messageProps} className={ROW_MESSAGE_CLASS} />
      <Dialog {...dialog.dialogProps} title="記一筆">
        <EntryForm
          accounts={accounts}
          categories={categories}
          today={today}
          action={addTransactionAction}
          accountId={accountId}
          defaultKind={defaultKind}
          remember
          onDone={dialog.done}
          onCancel={dialog.close}
        />
      </Dialog>
    </>
  );
}
