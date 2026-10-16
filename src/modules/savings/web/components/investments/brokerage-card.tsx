"use client";

import Link from "next/link";
import { Dialog, DialogButton, DialogMessage, useDialog } from "@/core/ui/dialog";
import { Icon } from "@/core/ui/icon";
import { MoreMenu } from "@/core/ui/more-menu";
import type { DateKey } from "../../../lib/dates";
import { formatTwd } from "../../../lib/money";
import { deleteAccountAction, moveAccountAction, setAccountActiveAction } from "../../actions";
import type { BrokerageView } from "../../investments-view";
import { accountDeleteWarning } from "../../settings-display";
import { AccountForm } from "../forms/account-form";
import { ROW_MESSAGE_CLASS } from "../forms/fields";
import type { AccountOption } from "../forms/options";
import { UpdateBalanceButton } from "../forms/update-balance";
import { ActiveMenuItem, DeleteMenuItem, MoveMenuItems, useRemovalNotice } from "../row-controls";
import { AddHoldingForm } from "./holding-forms";
import { Holdings } from "./holdings";

type BrokerageCardProps = {
  brokerage: BrokerageView;
  /** 買進扣款與賣出入帳的存款帳戶 */
  depositAccounts: AccountOption[];
  /** 修改帳戶時扣款帳戶的選項 證券帳戶用不到 表單一樣要 */
  payFromAccounts: { id: number; name: string; active: boolean }[];
  today: DateKey;
  /** 停用或刪除後整張卡片會不見 訊息交給外面 */
  onRemoved: (message: string) => void;
};

/** 一個證券帳戶一張卡片 有持股時列出每一檔 沒有持股時可以更新市值 */
export function BrokerageCard({ brokerage, depositAccounts, payFromAccounts, today, onRemoved }: BrokerageCardProps) {
  const edit = useDialog();
  const removal = useRemovalNotice();
  const headingId = `savings-brokerage-${brokerage.id}`;
  const hasHoldings = brokerage.holdings.length > 0;

  return (
    <section aria-labelledby={headingId} className="card stack min-w-0">
      <header className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 gap-y-2">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 id={headingId} className="text-lg font-semibold break-words text-ink">
            {brokerage.name}
          </h2>
          {brokerage.label && <p className="text-ink-soft">{brokerage.label}</p>}
        </div>
        <div className="col-span-2 row-start-2 flex flex-col gap-0.5">
          <span className="text-3xl font-bold tracking-tight text-ink tabular-nums">
            <span className="sr-only">市值 </span>
            {formatTwd(brokerage.value)}
          </span>
          {/* 損益與收盤日寫在最上面的摘要 這裡只說讀不到股價 市值是先用成本算的 */}
          {hasHoldings && !brokerage.priced && <span className="text-ink">股價暫時讀不到</span>}
        </div>
        <div className="col-start-2 row-start-1">
          <MoreMenu label={`「${brokerage.name}」的選項`}>
            <button {...edit.triggerProps} className="menu-item">
              <Icon name="pencil" className="size-4" />
              修改帳戶
            </button>
            <MoveMenuItems action={moveAccountAction} id={brokerage.id} isFirst={brokerage.isFirst} isLast={brokerage.isLast} />
            <ActiveMenuItem
              action={async (previous, formData) => {
                const result = await setAccountActiveAction(previous, formData);
                if (!result.error) onRemoved(result.message ?? `已停用「${brokerage.name}」，可以在帳戶頁最下面的「已停用」恢復`);
                return result;
              }}
              id={brokerage.id}
              active
              pausedHint="停用後不能再買賣、不算進總覽，紀錄與持股會留著"
            />
            <DeleteMenuItem
              action={deleteAccountAction}
              id={brokerage.id}
              confirmMessage={accountDeleteWarning(brokerage.name, brokerage.usage)}
              label="刪除帳戶"
              deletedMessage={`已刪除「${brokerage.name}」`}
              onDeleted={onRemoved}
            />
          </MoreMenu>
        </div>
      </header>
      <DialogMessage {...edit.messageProps} />
      <Dialog {...edit.dialogProps} title={`修改「${brokerage.name}」`}>
        <AccountForm account={brokerage.draft} payFromAccounts={payFromAccounts} onDone={edit.done} onCancel={edit.close} />
      </Dialog>
      {hasHoldings ? (
        <Holdings holdings={brokerage.holdings} accounts={depositAccounts} today={today} minDate={brokerage.startDate} onDeleted={removal.report} />
      ) : (
        <p className="text-ink">還沒有持股：市值照你更新的數字。新增持股後會照收盤價自動算。</p>
      )}
      <DialogMessage {...removal.messageProps} />
      <div className="button-row">
        <DialogButton
          label={
            <>
              <Icon name="plus" className="size-4" />
              新增持股
            </>
          }
          buttonClassName="btn-secondary btn-sm"
          title={`新增持股：${brokerage.name}`}
          messageClassName={ROW_MESSAGE_CLASS}
        >
          {({ done, close }) => <AddHoldingForm accountId={brokerage.id} onDone={done} onCancel={close} />}
        </DialogButton>
        {!hasHoldings && <UpdateBalanceButton account={{ id: brokerage.id, name: brokerage.name, kind: "investment", balance: brokerage.ledgerBalance }} />}
        <Link href={brokerage.recordsHref} className="btn-ghost btn-sm">
          查看紀錄
          <Icon name="chevron-right" className="size-4" />
        </Link>
      </div>
    </section>
  );
}
