"use client";

import { Dialog, DialogMessage, useDialog } from "@/core/ui/dialog";
import { Icon } from "@/core/ui/icon";
import { CardHeader } from "@/core/ui/page-header";
import { plannedAmount } from "../../entry-display";
import { choosableAccounts } from "../../form-math";
import { SAVINGS_PATHS } from "../../paths";
import { recurringDetail, type RecurringFormOptions, type RecurringRowView } from "../../recurring-view";
import { RecurringForm } from "../forms/recurring-form";
import { useRemovalNotice } from "../row-controls";
import { useLinkedTrigger } from "../settings/open-from-link";
import { IconTile } from "../visuals";
import { RECURRING_LIST, RecurringRow } from "./recurring-row";

type OtherRecurringListProps = {
  items: RecurringRowView[];
  form: RecurringFormOptions;
  openAdd?: boolean;
  openEditId?: number | null;
};

/** 房租 訂閱 電費這類 照下一期排 到期時確認與略過在列上 */
export function OtherRecurringList({ items, form, openAdd = false, openEditId = null }: OtherRecurringListProps) {
  const add = useDialog();
  const addTrigger = useLinkedTrigger(add, openAdd, SAVINGS_PATHS.recurring);
  const notice = useRemovalNotice();
  const accounts = choosableAccounts(form.accounts);

  return (
    <section aria-labelledby="savings-other-recurring" className="card stack @container min-w-0 overflow-hidden">
      <CardHeader
        id="savings-other-recurring"
        actions={
          accounts.length > 0 && (
            <button {...addTrigger} aria-label="新增固定收支" className="btn-secondary btn-sm">
              <Icon name="plus" className="size-4" />
              新增
            </button>
          )
        }
      >
        其他固定收支
      </CardHeader>
      <DialogMessage {...add.messageProps} />
      <DialogMessage {...notice.messageProps} />
      <Dialog {...add.dialogProps} title="新增固定收支">
        <RecurringForm preset="other" accounts={accounts} categories={form.categories} holdings={[]} today={form.today} onDone={add.done} onCancel={add.close} />
      </Dialog>
      {items.length === 0 ? (
        <p className="text-ink">{accounts.length > 0 ? "還沒有其他固定收支。房租、訂閱、電費這類每個月都有的，按「新增」設定後，到期時會提醒你確認。" : "先新增帳戶，才能設定固定收支。"}</p>
      ) : (
        <ul className={RECURRING_LIST}>
          {items.map((item) => (
            <RecurringRow
              key={item.id}
              row={item}
              leading={<IconTile name={item.icon} size="sm" />}
              title={item.title}
              detail={recurringDetail(item, item.schedule)}
              amountText={plannedAmount(item.kind, item.amount)}
              form={form}
              skipOnRow
              openFromLink={item.id === openEditId}
              onNotice={notice.report}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
