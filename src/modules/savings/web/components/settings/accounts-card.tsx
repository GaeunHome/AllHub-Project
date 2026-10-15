"use client";

import { useCallback, useRef } from "react";
import { Dialog, DialogMessage, useDialog } from "@/core/ui/dialog";
import { EmptyState } from "@/core/ui/empty-state";
import { Icon } from "@/core/ui/icon";
import { MoreMenu } from "@/core/ui/more-menu";
import { CardHeader } from "@/core/ui/page-header";
import type { PaletteColor } from "../../../lib/kinds";
import { deleteAccountAction, moveAccountAction, setAccountActiveAction } from "../../actions";
import { SAVINGS_PATHS } from "../../paths";
import { accountDeleteWarning, accountDetail, type AccountUsage } from "../../settings-display";
import { ColorDot } from "../color-dot";
import { AccountForm, type AccountDraft } from "../forms/account-form";
import { AccountKindIcon } from "../kind-icon";
import { ActiveMenuItem, DeleteMenuItem, EditButton, MoveButtons, MoveMenuItems, useRemovalNotice } from "../row-controls";
import { useOpenFromLink } from "./open-from-link";

/** 伺服器先整理好用途與扣款帳戶的名稱 以及刪除前要說的 */
export type AccountItem = AccountDraft & AccountUsage & { active: boolean; purposeName: string | null; purposeColor: PaletteColor | null; payFromName: string | null };

type Choices = { purposes: { id: number; name: string }[]; payFromAccounts: { id: number; name: string; active: boolean }[] };

type AccountsCardProps = {
  accounts: AccountItem[];
  purposes: Choices["purposes"];
  /** 從總覽或紀錄頁的新增帳戶連過來時 打開一次新增的視窗 */
  openAdd?: boolean;
};

export function AccountsCard({ accounts, purposes, openAdd = false }: AccountsCardProps) {
  const add = useDialog();
  const removal = useRemovalNotice();
  const payFromAccounts = accounts.filter((account) => account.kind === "deposit").map(({ id, name, active }) => ({ id, name, active }));

  // 自己打開視窗時焦點先放到新增帳戶 關掉後才回得到這個按鈕
  const addButton = useRef<HTMLButtonElement | null>(null);
  const triggerRef = add.triggerProps.ref;
  const addButtonRef = useCallback(
    (node: HTMLButtonElement | null) => {
      addButton.current = node;
      const detach = triggerRef(node);
      return () => {
        addButton.current = null;
        detach?.();
      };
    },
    [triggerRef],
  );
  useOpenFromLink(
    openAdd,
    () => {
      addButton.current?.focus();
      add.triggerProps.onClick();
    },
    SAVINGS_PATHS.accounts,
  );

  return (
    <section aria-labelledby="savings-accounts" className="card stack">
      <CardHeader
        id="savings-accounts"
        icon={<Icon name="landmark" />}
        actions={
          <button {...add.triggerProps} ref={addButtonRef} className="btn-secondary btn-sm">
            <Icon name="plus" className="size-4" />
            新增帳戶
          </button>
        }
      >
        帳戶
      </CardHeader>
      <DialogMessage {...add.messageProps} />
      <DialogMessage {...removal.messageProps} />
      {/* 視窗放在清單前面 清單是卡片最後一個子元素才會貼齊底部 */}
      <Dialog {...add.dialogProps} title="新增帳戶" icon={<Icon name="plus" />}>
        <AccountForm purposes={purposes} payFromAccounts={payFromAccounts} onDone={add.done} onCancel={add.close} />
      </Dialog>
      {accounts.length === 0 ? (
        <EmptyState compact icon="landmark" title="還沒有帳戶" hint="存款、投資、信用卡各新增一個，取一個自己認得的名字就好。" />
      ) : (
        <ul className="card-list">
          {accounts.map((account, index) => (
            <AccountRow
              key={account.id}
              account={account}
              isFirst={index === 0}
              isLast={index === accounts.length - 1}
              purposes={purposes}
              payFromAccounts={payFromAccounts}
              onDeleted={removal.report}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

type AccountRowProps = { account: AccountItem; isFirst: boolean; isLast: boolean; onDeleted: (message: string) => void } & Choices;

function AccountRow({ account, isFirst, isLast, purposes, payFromAccounts, onDeleted }: AccountRowProps) {
  const edit = useDialog();

  return (
    <li className="card-row stack">
      <div className="flex items-center gap-3">
        <span className="icon-tile size-9 rounded-xl">
          <AccountKindIcon kind={account.kind} />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className={`font-semibold break-words ${account.active ? "text-ink" : "text-ink-soft"}`}>{account.name}</span>
            {account.purposeName && account.purposeColor && (
              <span className="chip">
                <ColorDot color={account.purposeColor} className="size-2" />
                {account.purposeName}
              </span>
            )}
            {!account.active && <span className="chip chip-warning">已停用</span>}
          </p>
          <p className="text-sm text-ink-soft">{accountDetail(account)}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <MoveButtons action={moveAccountAction} id={account.id} name={account.name} isFirst={isFirst} isLast={isLast} />
          <EditButton name={account.name} {...edit.triggerProps} />
          <MoreMenu label={`「${account.name}」的選項`}>
            <MoveMenuItems action={moveAccountAction} id={account.id} isFirst={isFirst} isLast={isLast} />
            <ActiveMenuItem action={setAccountActiveAction} id={account.id} active={account.active} pausedHint="停用後不能再記帳、不算進總覽，紀錄會留著" />
            <DeleteMenuItem
              action={deleteAccountAction}
              id={account.id}
              confirmMessage={accountDeleteWarning(account.name, account)}
              label="刪除帳戶"
              deletedMessage={`已刪除「${account.name}」`}
              onDeleted={onDeleted}
            />
          </MoreMenu>
        </div>
      </div>
      <DialogMessage {...edit.messageProps} />
      <Dialog {...edit.dialogProps} title={`修改「${account.name}」`} icon={<Icon name="pencil" />}>
        <AccountForm account={account} purposes={purposes} payFromAccounts={payFromAccounts} onDone={edit.done} onCancel={edit.close} />
      </Dialog>
    </li>
  );
}
