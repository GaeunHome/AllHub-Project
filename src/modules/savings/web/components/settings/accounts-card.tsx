"use client";

import { Dialog, DialogMessage, useDialog } from "@/core/ui/dialog";
import { Icon } from "@/core/ui/icon";
import { MoreMenu } from "@/core/ui/more-menu";
import { CardHeader } from "@/core/ui/page-header";
import { ACCOUNT_KINDS, ACCOUNT_KIND_LABELS } from "../../../lib/kinds";
import { deleteAccountAction, moveAccountAction, setAccountActiveAction } from "../../actions";
import { SAVINGS_PATHS } from "../../paths";
import { accountDeleteWarning, accountDetail, type AccountUsage } from "../../settings-display";
import { AccountForm, type AccountDraft } from "../forms/account-form";
import { ActiveMenuItem, DeleteMenuItem, LIST_ROW_MESSAGE, ListGroup, ListRow, MoveMenuItems, useRemovalNotice } from "../row-controls";
import { useLinkedTrigger } from "./open-from-link";

/** 伺服器先整理好用途與扣款帳戶的名稱 以及刪除前要說的 */
export type AccountItem = AccountDraft & AccountUsage & { active: boolean; purposeName: string | null; payFromName: string | null };

type Choices = { purposes: { id: number; name: string }[]; payFromAccounts: { id: number; name: string; active: boolean }[] };

type AccountsCardProps = {
  accounts: AccountItem[];
  purposes: Choices["purposes"];
  /** 從總覽或紀錄頁的新增帳戶連過來時 打開一次新增的視窗 */
  openAdd?: boolean;
};

/** 照存款 投資 信用卡分組 上移下移只在同一組裡 */
export function AccountsCard({ accounts, purposes, openAdd = false }: AccountsCardProps) {
  const add = useDialog();
  const removal = useRemovalNotice();
  const payFromAccounts = accounts.filter((account) => account.kind === "deposit").map(({ id, name, active }) => ({ id, name, active }));
  const groups = ACCOUNT_KINDS.map((kind) => ({ kind, items: accounts.filter((account) => account.kind === kind) })).filter((group) => group.items.length > 0);

  const addTrigger = useLinkedTrigger(add, openAdd, SAVINGS_PATHS.accounts);

  return (
    <section aria-labelledby="savings-accounts" className="card stack overflow-hidden">
      <CardHeader
        id="savings-accounts"
        actions={
          <button {...addTrigger} aria-label="新增帳戶" className="btn-secondary btn-sm">
            <Icon name="plus" className="size-4" />
            新增
          </button>
        }
      >
        帳戶
      </CardHeader>
      <DialogMessage {...add.messageProps} />
      <DialogMessage {...removal.messageProps} />
      {/* 視窗放在清單前面 清單是卡片最後一個子元素才會貼齊底部 */}
      <Dialog {...add.dialogProps} title="新增帳戶">
        <AccountForm purposes={purposes} payFromAccounts={payFromAccounts} onDone={add.done} onCancel={add.close} />
      </Dialog>
      {groups.length === 0 ? (
        <p className="text-ink">還沒有帳戶，按「新增」加一個。</p>
      ) : (
        <div className="card-list">
          {groups.map((group) => (
            <ListGroup key={group.kind} id={`savings-accounts-${group.kind}`} title={ACCOUNT_KIND_LABELS[group.kind]}>
              {group.items.map((account, index) => (
                <AccountRow
                  key={account.id}
                  account={account}
                  isFirst={index === 0}
                  isLast={index === group.items.length - 1}
                  purposes={purposes}
                  payFromAccounts={payFromAccounts}
                  onDeleted={removal.report}
                />
              ))}
            </ListGroup>
          ))}
        </div>
      )}
    </section>
  );
}

type AccountRowProps = { account: AccountItem; isFirst: boolean; isLast: boolean; onDeleted: (message: string) => void } & Choices;

function AccountRow({ account, isFirst, isLast, purposes, payFromAccounts, onDeleted }: AccountRowProps) {
  const edit = useDialog();

  return (
    <ListRow
      title={account.name}
      detail={accountDetail(account)}
      badge={!account.active && <span className="chip">已停用</span>}
      muted={!account.active}
      trigger={edit.triggerProps}
      actionLabel="修改"
      menu={
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
      }
    >
      <DialogMessage {...edit.messageProps} className={LIST_ROW_MESSAGE} />
      <Dialog {...edit.dialogProps} title={`修改「${account.name}」`}>
        <AccountForm account={account} purposes={purposes} payFromAccounts={payFromAccounts} onDone={edit.done} onCancel={edit.close} />
      </Dialog>
    </ListRow>
  );
}
