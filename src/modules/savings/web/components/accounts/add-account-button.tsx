"use client";

import { usePathname } from "next/navigation";
import { Dialog, DialogMessage, useDialog } from "@/core/ui/dialog";
import { Icon } from "@/core/ui/icon";
import type { AccountKind } from "../../../lib/kinds";
import { AccountForm } from "../forms/account-form";
import { useLinkedTrigger } from "../settings/open-from-link";

const ADD_LABELS: Record<AccountKind, string> = { deposit: "新增銀行帳戶", investment: "新增證券帳戶", credit: "新增信用卡" };

export type AddAccountButtonProps = {
  /** 新增的一定是這種帳戶 */
  kind: AccountKind;
  /** 信用卡的扣款帳戶 只列存款帳戶 停用的也帶上 表單會濾掉 */
  payFromAccounts: readonly { id: number; name: string; active: boolean }[];
  className?: string;
  /** 成功訊息外面那一層 例如在格線裡撐滿一整列 */
  messageClassName?: string;
  /** 網址帶 add 參數連過來時打開一次 之後拿掉參數 */
  openFromLink?: boolean;
  /** 拿掉參數後的網址 預設是目前這一頁 */
  cleanHref?: string;
};

export function AddAccountButton({ kind, payFromAccounts, className = "btn-secondary", messageClassName, openFromLink = false, cleanHref }: AddAccountButtonProps) {
  const dialog = useDialog();
  const pathname = usePathname();
  const trigger = useLinkedTrigger(dialog, openFromLink, cleanHref ?? pathname);

  return (
    <>
      <button {...trigger} className={className}>
        <Icon name="plus" className="size-4" />
        {ADD_LABELS[kind]}
      </button>
      <DialogMessage {...dialog.messageProps} className={messageClassName} />
      <Dialog {...dialog.dialogProps} title={ADD_LABELS[kind]}>
        <AccountForm kind={kind} payFromAccounts={payFromAccounts} onDone={dialog.done} onCancel={dialog.close} />
      </Dialog>
    </>
  );
}
