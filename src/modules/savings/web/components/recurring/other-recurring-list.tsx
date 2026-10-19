"use client";

import { useDialog } from "@/core/ui/dialog";
import { plannedAmount, recurringDetail } from "../../format";
import { choosableAccounts } from "../../form-math";
import { SAVINGS_PATHS } from "../../paths";
import type { RecurringFormOptions, RecurringRowView } from "../../recurring-view";
import { RecurringForm } from "../forms/recurring-form";
import { useRemovalNotice } from "../row-controls";
import { useLinkedTrigger } from "../settings/open-from-link";
import { IconTile } from "../visuals";
import { RecurringRow } from "./recurring-row";
import { RecurringSection } from "./recurring-section";

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
    <RecurringSection
      id="savings-other-recurring"
      title="其他固定收支"
      add={add}
      addTrigger={accounts.length > 0 ? addTrigger : undefined}
      addLabel="新增固定收支"
      addTitle="新增固定收支"
      addForm={<RecurringForm preset="other" accounts={accounts} categories={form.categories} holdings={[]} today={form.today} onDone={add.done} onCancel={add.close} />}
      notice={notice}
      empty={
        items.length === 0 ? (
          <p className="text-ink">{accounts.length > 0 ? "還沒有其他固定收支。房租、訂閱、電費這類每個月都有的，按「新增」設定後，到期時會提醒你確認。" : "先新增帳戶，才能設定固定收支。"}</p>
        ) : undefined
      }
    >
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
    </RecurringSection>
  );
}
