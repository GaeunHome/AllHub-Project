"use client";

import { Dialog, DialogMessage, useDialog } from "@/core/ui/dialog";
import { Icon } from "@/core/ui/icon";
import type { EntryKind } from "../../../lib/kinds";
import { addTransactionAction } from "../../actions";
import { useAutoHide } from "./auto-hide";
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
      <Dialog {...dialog.dialogProps} title="記一筆" icon={<Icon name="receipt" />}>
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

// 一句話看得完就收起來 不一直蓋在內容上
const FAB_MESSAGE_MS = 4000;

// 跟加號按鈕同一個高度
const FAB_BOTTOM = "bottom-[max(1rem,calc(env(safe-area-inset-bottom)+0.5rem))]";

/** 手機右下角的加號按鈕 成功訊息浮在按鈕左邊 幾秒後收起 */
export function QuickAddFab({ accounts, categories, today }: EntryFormOptions) {
  const dialog = useDialog();
  const toast = useAutoHide(FAB_MESSAGE_MS);

  if (accounts.length === 0) return null;
  const done = (message: string | undefined) => {
    dialog.done(message);
    toast.show();
  };

  return (
    <>
      {/* 頁面最下面多留一段 捲到底時最後一張卡片才不會被按鈕蓋住 */}
      <div aria-hidden className="h-12 sm:hidden" />
      <button
        {...dialog.triggerProps}
        aria-label="記一筆"
        className={`btn-primary fixed right-4 ${FAB_BOTTOM} z-30 size-14 rounded-full p-0 shadow-[var(--elevation-lift)] sm:hidden`}
      >
        <Icon name="plus" className="size-6" />
      </button>
      {/* 後來別的視窗也成功時 DialogMessageScope 只留最新一則 這則就收起來 */}
      {dialog.message && toast.visible && (
        // 排在加號按鈕左邊而且點得穿 蓋到的按鈕照樣按得到
        // 半透明的成功底色疊在內容上看不清楚 所以墊一層不透明的底
        <div className={`pointer-events-none fixed left-4 right-[5.25rem] ${FAB_BOTTOM} z-30 flex min-h-14 items-center justify-end sm:hidden`}>
          <div className="rounded-lg bg-surface-solid shadow-[var(--elevation-lift)]">
            <DialogMessage {...dialog.messageProps} />
          </div>
        </div>
      )}
      <Dialog {...dialog.dialogProps} title="記一筆" icon={<Icon name="receipt" />}>
        <EntryForm accounts={accounts} categories={categories} today={today} action={addTransactionAction} remember onDone={done} onCancel={dialog.close} />
      </Dialog>
    </>
  );
}
