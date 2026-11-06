"use client";

import { useDialog } from "@/core/ui/dialog";
import { RECURRING_MODE_LABELS } from "../../../lib/kinds";
import { formatTwd } from "../../../lib/money";
import { subscriptionMonthlyTotal } from "../../../lib/recurring";
import { plannedAmount } from "../../format";
import { choosableAccounts } from "../../form-math";
import { SAVINGS_PATHS } from "../../paths";
import type { RecurringFormOptions, RecurringRowView } from "../../recurring-view";
import { RecurringForm } from "../forms/recurring-form";
import { Sum } from "../section-heading";
import { useLinkedTrigger } from "../settings/open-from-link";
import { IconTile } from "../visuals";
import { RecurringCard } from "./recurring-card";
import { RecurringSection } from "./recurring-section";

type SubscriptionListProps = {
  items: RecurringRowView[];
  monthly: number;
  form: RecurringFormOptions;
  openAdd?: boolean;
  openEditId?: number | null;
};

/** 不是每月扣款的才要換算 每月的金額就是卡片上的數字 */
const averageLine = (item: RecurringRowView) => (item.draft.intervalMonths === 1 ? [] : [`平均每月 ${formatTwd(subscriptionMonthlyTotal([item.draft]))}`]);

/** Netflix 這類 標題右邊是平均每個月花多少 續訂前 3 天會通知 */
export function SubscriptionList({ items, monthly, form, openAdd = false, openEditId = null }: SubscriptionListProps) {
  const add = useDialog();
  const addTrigger = useLinkedTrigger(add, openAdd, SAVINGS_PATHS.recurring);
  const accounts = choosableAccounts(form.accounts);

  return (
    <RecurringSection
      id="savings-subscriptions"
      title="訂閱"
      summary={items.length > 0 ? <Sum label="平均每月" amount={monthly} /> : undefined}
      add={add}
      addTrigger={accounts.length > 0 ? addTrigger : undefined}
      addLabel="新增訂閱"
      addTitle="新增訂閱"
      addForm={<RecurringForm preset="subscription" accounts={accounts} categories={form.categories} holdings={[]} today={form.today} onDone={add.done} onCancel={add.close} />}
      empty={items.length === 0 ? <p className="text-ink">{accounts.length > 0 ? "還沒有訂閱。Netflix、Spotify 這類按「新增訂閱」設定，續訂前 3 天會提醒你。" : "先新增帳戶，才能設定訂閱。"}</p> : undefined}
    >
      {items.map((item) => (
        <RecurringCard
          key={item.id}
          row={item}
          leading={<IconTile name={item.icon} size="sm" />}
          title={item.title}
          detail={[item.when, ...averageLine(item), RECURRING_MODE_LABELS[item.mode]]}
          amountText={plannedAmount(item.kind, item.amount)}
          form={form}
          skipOnRow
          openFromLink={item.id === openEditId}
        />
      ))}
    </RecurringSection>
  );
}
