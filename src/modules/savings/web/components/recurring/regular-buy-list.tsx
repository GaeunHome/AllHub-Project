"use client";

import Link from "next/link";
import { Dialog, DialogMessage, useDialog } from "@/core/ui/dialog";
import { Icon } from "@/core/ui/icon";
import { CardHeader } from "@/core/ui/page-header";
import { formatTwd } from "../../../lib/money";
import { choosableAccounts } from "../../form-math";
import { SAVINGS_PATHS } from "../../paths";
import { recurringDetail, type RecurringFormOptions, type RegularBuyView } from "../../recurring-view";
import { RecurringForm } from "../forms/recurring-form";
import { useRemovalNotice } from "../row-controls";
import { useLinkedTrigger } from "../settings/open-from-link";
import { IconTile, Ticker } from "../visuals";
import { RECURRING_LIST, RecurringRow } from "./recurring-row";

type RegularBuyListProps = {
  items: RegularBuyView[];
  form: RecurringFormOptions;
  /** 投資頁上已經在持股旁邊 不用再連過去 */
  linkToInvestments?: boolean;
  /** 網址的 add=regular-buy 打開一次新增的視窗 */
  openAdd?: boolean;
  /** 網址的 edit 是其中一條時打開它的修改視窗 */
  openEditId?: number | null;
};

/** 投資頁與每月固定頁共用 到期時確認就在列上 */
export function RegularBuyList({ items, form, linkToInvestments = true, openAdd = false, openEditId = null }: RegularBuyListProps) {
  const add = useDialog();
  const addTrigger = useLinkedTrigger(add, openAdd, SAVINGS_PATHS.recurring);
  const notice = useRemovalNotice();
  const holdings = choosableAccounts(form.holdings);
  const deposits = form.accounts.filter((account) => account.active && account.kind === "deposit");
  const canAdd = holdings.length > 0 && deposits.length > 0;

  return (
    <section aria-labelledby="savings-regular-buys" className="card stack @container min-w-0 overflow-hidden">
      <CardHeader
        id="savings-regular-buys"
        actions={
          canAdd && (
            <button {...addTrigger} aria-label="新增定期定額" className="btn-secondary btn-sm">
              <Icon name="plus" className="size-4" />
              新增
            </button>
          )
        }
      >
        定期定額
      </CardHeader>
      <DialogMessage {...add.messageProps} />
      <DialogMessage {...notice.messageProps} />
      <Dialog {...add.dialogProps} title="新增定期定額">
        <RecurringForm preset="regular-buy" accounts={choosableAccounts(form.accounts)} categories={form.categories} holdings={holdings} today={form.today} onDone={add.done} onCancel={add.close} />
      </Dialog>
      {items.length === 0 ? (
        <EmptyText canAdd={canAdd} hasHoldings={holdings.length > 0} linkToInvestments={linkToInvestments} />
      ) : (
        <ul className={RECURRING_LIST}>
          {items.map((item) => (
            <RecurringRow
              key={item.id}
              row={item}
              leading={item.symbol ? <Ticker symbol={item.symbol} /> : <IconTile name="chart-line" size="sm" />}
              title={item.draft.name ?? item.holdingName ?? item.title}
              detail={recurringDetail(item, item.when, item.fromName ? [`從${item.fromName}扣`] : [])}
              amountText={formatTwd(item.amount)}
              form={form}
              openFromLink={item.id === openEditId}
              onNotice={notice.report}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

/** 還不能新增時說明缺什麼 */
function EmptyText({ canAdd, hasHoldings, linkToInvestments }: { canAdd: boolean; hasHoldings: boolean; linkToInvestments: boolean }) {
  if (canAdd) return <p className="text-ink">還沒有定期定額。按「新增」設定每個月自動買進的那一檔，到期時在這裡確認股數。</p>;
  if (!hasHoldings) {
    return (
      <p className="text-ink">
        先新增持股，才能設定定期定額。
        {linkToInvestments && (
          <Link href={SAVINGS_PATHS.investments} className="link">
            到投資新增持股
          </Link>
        )}
      </p>
    );
  }
  return <p className="text-ink">要有銀行帳戶才能扣款，請先到帳戶新增。</p>;
}
