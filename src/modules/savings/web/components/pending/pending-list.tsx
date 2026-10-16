"use client";

import Link from "next/link";
import { ActionButton } from "@/core/ui/action-button";
import { Dialog, useDialog } from "@/core/ui/dialog";
import type { FormState } from "@/core/ui/form-message";
import { Icon } from "@/core/ui/icon";
import { MoreMenu } from "@/core/ui/more-menu";
import { CardHeader } from "@/core/ui/page-header";
import { StatusChip } from "@/core/ui/status-chip";
import type { DateKey } from "../../../lib/dates";
import { formatMonth } from "../../../lib/month";
import { skipOccurrenceAction } from "../../actions";
import type { PendingAction, PendingEntry } from "../../dashboard-view";
import { editRecurringPath } from "../../paths";
import { BillForm } from "../accounts/card-bill";
import { PayCardForm } from "../accounts/pay-card-form";
import { useOverviewNotice } from "../dashboard/overview-notice";
import type { AccountOption, CategoryOption, SalaryAccountOption } from "../forms/options";
import { SalaryForm } from "../forms/salary-dialog";
import { ConfirmForm } from "./confirm-form";

const ACTION_LABELS: Record<PendingAction, string> = { bill: "填帳單", pay: "已繳", confirm: "確認", allocate: "入帳並分配" };

type PendingListProps = {
  entries: PendingEntry[];
  /** 繳卡費能選的存款帳戶 */
  payFromAccounts: AccountOption[];
  /** 入帳並分配的入帳與轉入帳戶 */
  salaryAccounts: SalaryAccountOption[];
  /** 薪水的分類與帳單差額的分類 */
  categories: CategoryOption[];
  today: DateKey;
};

/**
 * 卡片夠寬時金額與按鈕各佔一欄 每一列對齊
 * 窄的時候兩行 名稱與金額一行 說明與按鈕一行
 */
export function PendingList({ entries, payFromAccounts, salaryAccounts, categories, today }: PendingListProps) {
  return (
    <section aria-labelledby="fin-pending" className="card stack @container min-w-0 overflow-hidden">
      <CardHeader id="fin-pending">待處理</CardHeader>
      <ul className="card-list @xl:grid @xl:grid-cols-[minmax(0,1fr)_auto_auto_auto]">
        {entries.map((entry) => (
          <PendingRow key={entry.row.key} entry={entry} payFromAccounts={payFromAccounts} salaryAccounts={salaryAccounts} categories={categories} today={today} />
        ))}
      </ul>
    </section>
  );
}

/** 處理完這一列會不見 成功訊息交給外面的 OverviewNotice */
function PendingRow({ entry, payFromAccounts, salaryAccounts, categories, today }: { entry: PendingEntry } & Omit<PendingListProps, "entries">) {
  const dialog = useDialog();
  const report = useOverviewNotice();
  const { row } = entry;
  const label = ACTION_LABELS[row.action];
  const done = (message: string | undefined) => {
    dialog.done();
    if (message) report(message);
  };

  return (
    <li className="card-row grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 @xl:col-span-4 @xl:grid-cols-subgrid">
      <span className="col-start-1 row-start-1 font-medium break-words text-ink">{row.name}</span>
      {/* 窄的時候逾期的標籤放在說明這一行 一列才只有兩行 */}
      <span className="col-start-1 row-start-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-soft">
        {row.detail}
        {row.badge && <StatusChip badge={row.badge} className="@xl:hidden" />}
      </span>
      <span className="col-start-2 row-start-1 flex items-center justify-end gap-2 @xl:row-span-2">
        {row.badge && <StatusChip badge={row.badge} className="hidden @xl:inline-flex" />}
        <span className="font-medium text-ink tabular-nums">{row.amountText}</span>
      </span>
      <div className="col-start-2 row-start-2 flex items-center justify-end gap-1 @xl:contents">
        <button {...dialog.triggerProps} aria-label={`${label}：${row.name}`} className="btn-secondary btn-sm @xl:col-start-3 @xl:row-span-2 @xl:row-start-1">
          {label}
        </button>
        <div className="@xl:col-start-4 @xl:row-span-2 @xl:row-start-1">
          {entry.rule ? <RuleMenu name={row.name} rule={entry.rule} onSkipped={report} /> : <span aria-hidden className="block size-9 pointer-coarse:size-11" />}
        </div>
      </div>
      <Dialog {...dialog.dialogProps} title={`${label}：${row.name}`} size={entry.salary ? "lg" : "md"}>
        {entry.bill && <BillForm draft={entry.bill} categories={categories} accounts={payFromAccounts} today={today} onDone={done} onCancel={dialog.close} />}
        {entry.pay && <PayCardForm draft={entry.pay} accounts={payFromAccounts} today={today} onDone={done} onCancel={dialog.close} />}
        {entry.confirm && <ConfirmForm draft={entry.confirm} today={today} onDone={done} onCancel={dialog.close} />}
        {entry.salary && <SalaryForm accounts={salaryAccounts} categories={categories} today={today} prefill={entry.salary} onDone={done} onCancel={dialog.close} />}
      </Dialog>
    </li>
  );
}

/** 略過也是處理掉這一期 先確認 修改連到設定頁的固定收支 */
function RuleMenu({ name, rule, onSkipped }: { name: string; rule: NonNullable<PendingEntry["rule"]>; onSkipped: (message: string) => void }) {
  const skip = async (previous: FormState, formData: FormData) => {
    const result = await skipOccurrenceAction(previous, formData);
    if (!result.error) onSkipped(result.message ?? `已略過「${name}」${formatMonth(rule.period)}`);
    return result;
  };

  return (
    <MoreMenu label={`「${name}」的選項`}>
      <ActionButton
        action={skip}
        fields={{ ruleId: rule.ruleId, period: rule.period }}
        confirmMessage={`略過「${name}」${formatMonth(rule.period)}這一期？這一期不會記帳。`}
        formClassName="flex flex-col gap-1"
        className="menu-item"
      >
        <Icon name="check-check" className="size-4" />
        略過這一期
      </ActionButton>
      <Link href={editRecurringPath(rule.ruleId)} className="menu-item">
        <Icon name="pencil" className="size-4" />
        修改這個固定收支
      </Link>
    </MoreMenu>
  );
}
