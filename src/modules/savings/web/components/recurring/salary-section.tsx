"use client";

import { Dialog, DialogMessage, useDialog } from "@/core/ui/dialog";
import { Icon } from "@/core/ui/icon";
import { CardHeader } from "@/core/ui/page-header";
import { formatSignedTwd, formatTwd } from "../../../lib/money";
import { choosableAccounts } from "../../form-math";
import { SAVINGS_PATHS } from "../../paths";
import { recurringDetail, type AllocationAccount, type AllocationLineView, type RecurringFormOptions, type SalaryView } from "../../recurring-view";
import type { SalaryAccountOption } from "../forms/options";
import { RecurringForm } from "../forms/recurring-form";
import { Illustration } from "../illustration";
import { useRemovalNotice } from "../row-controls";
import { useLinkedTrigger } from "../settings/open-from-link";
import { IconTile } from "../visuals";
import { AllocationForm } from "./allocation-form";
import { RECURRING_LIST, RecurringRow } from "./recurring-row";

type SalarySectionProps = {
  items: SalaryView[];
  form: RecurringFormOptions;
  salaryAccounts: SalaryAccountOption[];
  allocationAccounts: AllocationAccount[];
  openAdd?: boolean;
  openEditId?: number | null;
};

/** 每條薪水寫出入帳後怎麼分配 到期時入帳並分配在列上 */
export function SalarySection({ items, form, salaryAccounts, allocationAccounts, openAdd = false, openEditId = null }: SalarySectionProps) {
  const add = useDialog();
  const notice = useRemovalNotice();
  const accounts = choosableAccounts(form.accounts);
  // 跟表單一樣 薪水不能入帳到信用卡與有持股的投資帳戶
  const canAdd = accounts.some((account) => account.kind !== "credit" && !account.withHoldings);
  // 沒有能入帳的帳戶時不打開 畫面上說明先新增銀行帳戶
  const addTrigger = useLinkedTrigger(add, openAdd && canAdd, SAVINGS_PATHS.recurring);

  return (
    <section aria-labelledby="savings-salary" className="card stack @container min-w-0 overflow-hidden">
      <CardHeader
        id="savings-salary"
        actions={
          items.length > 0 &&
          canAdd && (
            <button {...addTrigger} aria-label="新增薪水" className="btn-secondary btn-sm">
              <Icon name="plus" className="size-4" />
              新增
            </button>
          )
        }
      >
        薪水
      </CardHeader>
      <DialogMessage {...add.messageProps} />
      <DialogMessage {...notice.messageProps} />
      <Dialog {...add.dialogProps} title="設定薪水">
        <RecurringForm preset="salary" accounts={accounts} categories={form.categories} holdings={[]} today={form.today} onDone={add.done} onCancel={add.close} />
      </Dialog>
      {items.length === 0 ? (
        <div className="flex flex-col items-center gap-4 text-center sm:flex-row sm:text-left">
          <Illustration name="no-recurring" className="w-32" />
          <div className="flex flex-col items-center gap-3 sm:items-start">
            <p className="text-ink">{canAdd ? "設定發薪日與入帳帳戶後，每個月到了會提醒你入帳，並照設定分配到各帳戶。" : "先新增銀行帳戶，才能設定薪水入帳到哪裡。"}</p>
            {canAdd && (
              <button {...addTrigger} className="btn-primary">
                <Icon name="plus" className="size-4" />
                設定薪水
              </button>
            )}
          </div>
        </div>
      ) : (
        <ul className={RECURRING_LIST}>
          {items.map((item) => (
            <RecurringRow
              key={item.id}
              row={item}
              leading={<IconTile name={item.icon} size="sm" />}
              title={item.title}
              detail={recurringDetail(item, item.when, item.receivingName ? [`入帳到${item.receivingName}`] : [])}
              amountText={formatSignedTwd(item.amount)}
              form={form}
              salaryAccounts={salaryAccounts}
              openFromLink={item.id === openEditId}
              onNotice={notice.report}
            >
              <AllocationSummary item={item} accounts={allocationAccounts.filter((account) => account.id !== item.draft.accountId)} />
            </RecurringRow>
          ))}
        </ul>
      )}
    </section>
  );
}

/** 照現在的餘額算 有目標的會少轉或不轉 */
function lineNote(line: AllocationLineView): string | null {
  if (line.target === null) return null;
  if (line.reason === "target-reached") return `已達目標 ${formatTwd(line.target)}，先不轉`;
  if (line.reason === "target-capped") return `離目標 ${formatTwd(line.target)} 只差這些`;
  return `存到 ${formatTwd(line.target)} 就停`;
}

function AllocationSummary({ item, accounts }: { item: SalaryView; accounts: AllocationAccount[] }) {
  const edit = useDialog();
  const over = item.remainder < 0;

  return (
    <div className="panel stack gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold text-ink">入帳後怎麼分配</h3>
        <button {...edit.triggerProps} aria-label={`修改分配：${item.title}`} className="btn-secondary btn-sm">
          <Icon name="pencil" className="size-4" />
          修改分配
        </button>
      </div>
      {item.allocation.length === 0 ? (
        <p className="text-ink">還沒有設定：薪水會全部留在「{item.receivingName}」。</p>
      ) : (
        <dl className="flex flex-col divide-y divide-line">
          {item.allocation.map((line) => {
            const note = lineNote(line);
            return (
              <div key={line.accountId} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-0.5 py-2">
                <dt className="min-w-0 text-ink">
                  {line.name}
                  {note && <span className="text-ink-soft"> · {note}</span>}
                </dt>
                <dd className="font-medium text-ink tabular-nums">{formatTwd(line.suggested)}</dd>
              </div>
            );
          })}
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-0.5 py-2">
            <dt className="text-ink">{over ? "分出去的比預計的薪水多" : `留在${item.receivingName}`}</dt>
            <dd className={`font-medium tabular-nums ${over ? "text-danger" : "text-ink"}`}>{formatTwd(Math.abs(item.remainder))}</dd>
          </div>
        </dl>
      )}
      <DialogMessage {...edit.messageProps} />
      <Dialog {...edit.dialogProps} title="修改分配" size="lg">
        <AllocationForm accounts={accounts} receivingName={item.receivingName} onDone={edit.done} onCancel={edit.close} />
      </Dialog>
    </div>
  );
}
