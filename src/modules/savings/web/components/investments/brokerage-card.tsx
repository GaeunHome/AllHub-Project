"use client";

import Link from "next/link";
import { DeleteMenuItem } from "@/core/ui/delete-menu-item";
import { Dialog, DialogButton, useDialog } from "@/core/ui/dialog";
import { Icon } from "@/core/ui/icon";
import { MoreMenu } from "@/core/ui/more-menu";
import type { DateKey } from "../../../lib/dates";
import { deleteAccountAction, moveAccountAction, setAccountActiveAction } from "../../actions";
import type { BrokerageView } from "../../investments-view";
import { accountDeleteWarning } from "../../settings-display";
import { ADD_TILE, CARD_GRID } from "../dashboard/layout";
import { AccountForm } from "../forms/account-form";
import type { AccountOption } from "../forms/options";
import { UpdateBalanceButton } from "../forms/update-balance";
import { ActiveMenuItem, DialogMenuItem, MoveMenuItems } from "../row-controls";
import { SectionHeading, Sum } from "../section-heading";
import { AddHoldingForm } from "./holding-forms";
import { Holdings } from "./holdings";

type BrokerageCardProps = {
  brokerage: BrokerageView;
  /** 買進扣款與賣出入帳的存款帳戶 */
  depositAccounts: AccountOption[];
  /** 修改帳戶時扣款帳戶的選項 證券帳戶用不到 表單一樣要 */
  payFromAccounts: { id: number; name: string; active: boolean }[];
  today: DateKey;
};

/** 一個證券帳戶一區 有持股時每一檔一張卡 沒有持股時可以更新市值 */
export function BrokerageCard({ brokerage, depositAccounts, payFromAccounts, today }: BrokerageCardProps) {
  const edit = useDialog();
  const headingId = `savings-brokerage-${brokerage.id}`;
  const hasHoldings = brokerage.holdings.length > 0;
  const addTile = (
    <DialogButton
      label={
        <>
          <Icon name="plus" className="size-4" />
          新增持股
        </>
      }
      buttonClassName={ADD_TILE}
      title={`新增持股：${brokerage.name}`}
    >
      {({ done, close }) => <AddHoldingForm accountId={brokerage.id} onDone={done} onCancel={close} />}
    </DialogButton>
  );

  return (
    <section aria-labelledby={headingId} className="stack min-w-0">
      <SectionHeading
        id={headingId}
        title={
          <>
            {brokerage.name}
            {brokerage.label && <span className="text-base font-normal text-ink-soft">{brokerage.label}</span>}
          </>
        }
        summary={
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {/* 讀不到股價時市值是先用成本算的 */}
            {hasHoldings && !brokerage.priced && <span className="text-ink">股價暫時無法讀取</span>}
            <Sum label="市值" amount={brokerage.value} />
            <Link href={brokerage.recordsHref} className="card-header-link">
              查看紀錄
              <Icon name="chevron-right" className="size-4" />
            </Link>
            <MoreMenu label={`「${brokerage.name}」的選項`}>
              <DialogMenuItem trigger={edit.triggerProps} icon="pencil" label="修改帳戶" />
              <MoveMenuItems action={moveAccountAction} id={brokerage.id} isFirst={brokerage.isFirst} isLast={brokerage.isLast} />
              <ActiveMenuItem
                action={setAccountActiveAction}
                id={brokerage.id}
                active
                pausedHint="停用後不能再買賣、不算進總覽，紀錄與持股會留著"
                changedMessage={`已停用「${brokerage.name}」，可以在帳戶頁最下面的「已停用」恢復`}
              />
              <DeleteMenuItem
                action={deleteAccountAction}
                fields={{ id: brokerage.id }}
                confirmMessage={accountDeleteWarning(brokerage.name, brokerage.usage)}
                label="刪除帳戶"
                deletedMessage={`已刪除「${brokerage.name}」`}
              />
            </MoreMenu>
          </div>
        }
      />
      <Dialog {...edit.dialogProps} title={`修改「${brokerage.name}」`}>
        <AccountForm account={brokerage.draft} payFromAccounts={payFromAccounts} today={today} onDone={edit.done} onCancel={edit.close} />
      </Dialog>
      {hasHoldings ? (
        <Holdings holdings={brokerage.holdings} accounts={depositAccounts} today={today} minDate={brokerage.startDate} addTile={addTile} />
      ) : (
        <div className={CARD_GRID}>
          <div className="card flex min-w-0 flex-col gap-4">
            <p className="flex-1 text-ink">還沒有持股：市值照你更新的數字。新增持股後會照收盤價自動算。</p>
            <div className="button-row">
              <UpdateBalanceButton account={{ id: brokerage.id, name: brokerage.name, kind: "investment", balance: brokerage.ledgerBalance }} />
            </div>
          </div>
          {addTile}
        </div>
      )}
    </section>
  );
}
