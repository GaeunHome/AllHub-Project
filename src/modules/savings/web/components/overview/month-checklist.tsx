"use client";

import Link from "next/link";
import { Dialog, useDialog } from "@/core/ui/dialog";
import { Icon, type UiIconName } from "@/core/ui/icon";
import { MoreMenu } from "@/core/ui/more-menu";
import { StatusChip } from "@/core/ui/status-chip";
import type { ChecklistState } from "../../../lib/checklist";
import type { DateKey } from "../../../lib/dates";
import type { ChecklistRow } from "../../overview-view";
import { editRecurringPath } from "../../paths";
import type { PendingAction, PendingEntry } from "../../pending-view";
import { BillForm } from "../accounts/card-bill";
import { PayCardForm } from "../accounts/pay-card-form";
import type { AccountOption, CategoryOption, SalaryAccountOption } from "../forms/options";
import { SalaryForm } from "../forms/salary-dialog";
import { ConfirmForm } from "../pending/confirm-form";
import { SkipButton } from "../row-controls";

const ACTION_LABELS: Record<PendingAction, string> = { bill: "填帳單", pay: "已繳", confirm: "確認", allocate: "入帳並分配" };

const MARKS: Record<ChecklistState, { icon: UiIconName; className: string }> = {
  done: { icon: "circle-check", className: "text-success" },
  "auto-done": { icon: "circle-check", className: "text-success" },
  skipped: { icon: "circle-minus", className: "text-ink-soft" },
  todo: { icon: "circle", className: "text-ink-soft" },
  overdue: { icon: "circle", className: "text-danger" },
  auto: { icon: "calendar-clock", className: "text-ink-soft" },
};

const FINISHED: readonly ChecklistState[] = ["done", "auto-done", "skipped"];

export type MonthChecklistProps = {
  rows: ChecklistRow[];
  /** 繳卡費能選的存款帳戶 */
  payFromAccounts: AccountOption[];
  /** 入帳並分配的入帳與轉入帳戶 */
  salaryAccounts: SalaryAccountOption[];
  /** 薪水的分類與帳單差額的分類 */
  categories: CategoryOption[];
  today: DateKey;
};

/**
 * 一條時間軸串起這個月的事 下一件標出來 做完的留著打勾 顏色淡一點
 * 要處理的那一列有一顆按鈕 夠寬時金額與按鈕各佔一欄 窄的時候兩行
 */
export function MonthChecklist({ rows, ...context }: MonthChecklistProps) {
  const nextKey = rows.find((row) => !FINISHED.includes(row.state) && row.state !== "auto")?.key;
  return (
    <ul className="fin-timeline @xl:grid @xl:grid-cols-[auto_minmax(0,1fr)_auto_auto]">
      {rows.map((row) => (
        <ChecklistItemRow key={row.key} row={row} next={row.key === nextKey} {...context} />
      ))}
    </ul>
  );
}

/** 處理完按鈕會不見 結果用提示視窗 焦點交給外面的卡片 */
function ChecklistItemRow({ row, next, payFromAccounts, salaryAccounts, categories, today }: { row: ChecklistRow; next: boolean } & Omit<MonthChecklistProps, "rows">) {
  const dialog = useDialog();
  const finished = FINISHED.includes(row.state);
  const mark = MARKS[row.state];
  const { entry } = row;
  const label = entry ? ACTION_LABELS[entry.row.action] : null;

  return (
    <li data-next={next || undefined} className="fin-timeline-row grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 @xl:col-span-4 @xl:grid-cols-subgrid">
      <span className="fin-timeline-mark col-start-1 row-span-2 row-start-1 self-start @xl:self-center">
        <Icon name={mark.icon} className={`size-5 ${mark.className}`} />
      </span>
      <span className={`col-start-2 row-start-1 font-medium break-words ${finished ? "text-ink-soft" : "text-ink"}`}>{row.title}</span>
      {/* 日期與狀態各一欄 每一列才對齊 太窄時上下排 窄的時候逾期的標籤放在狀態這一欄 */}
      <span className="col-start-2 row-start-2 grid gap-x-3 gap-y-0.5 text-sm text-ink-soft @md:grid-cols-[9rem_minmax(0,1fr)]">
        <span className="tabular-nums">{row.date}</span>
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {row.note}
          {row.badge && <StatusChip badge={row.badge} className="@xl:hidden" />}
        </span>
      </span>
      <span className="col-start-3 row-start-1 flex items-center justify-end gap-2 @xl:row-span-2">
        {row.badge && <StatusChip badge={row.badge} className="hidden @xl:inline-flex" />}
        <span className={`font-medium tabular-nums ${finished ? "text-ink-soft" : "text-ink"}`}>{row.amountText}</span>
      </span>
      <div className="col-start-3 row-start-2 flex items-center justify-end gap-1 @xl:col-start-4 @xl:row-span-2 @xl:row-start-1">
        {entry && label && (
          <>
            <button {...dialog.triggerProps} aria-label={`${label}：${row.title}`} className="btn-secondary btn-sm">
              {label}
            </button>
            {entry.rule ? <RuleMenu name={row.title} rule={entry.rule} /> : <span aria-hidden className="block size-9 pointer-coarse:size-11" />}
            <Dialog {...dialog.dialogProps} title={`${label}：${row.title}`} size={entry.salary ? "lg" : "md"}>
              <EntryDialog entry={entry} payFromAccounts={payFromAccounts} salaryAccounts={salaryAccounts} categories={categories} today={today} onDone={dialog.done} onCancel={dialog.close} />
            </Dialog>
          </>
        )}
      </div>
    </li>
  );
}

function EntryDialog({ entry, payFromAccounts, salaryAccounts, categories, today, onDone, onCancel }: { entry: PendingEntry; onDone: (message: string | undefined) => void; onCancel: () => void } & Omit<MonthChecklistProps, "rows">) {
  if (entry.bill) return <BillForm draft={entry.bill} categories={categories} accounts={payFromAccounts} today={today} onDone={onDone} onCancel={onCancel} />;
  if (entry.pay) return <PayCardForm draft={entry.pay} accounts={payFromAccounts} today={today} onDone={onDone} onCancel={onCancel} />;
  if (entry.confirm) return <ConfirmForm draft={entry.confirm} today={today} onDone={onDone} onCancel={onCancel} />;
  if (entry.salary) return <SalaryForm accounts={salaryAccounts} categories={categories} today={today} prefill={entry.salary} onDone={onDone} onCancel={onCancel} />;
  return null;
}

/** 修改打開每月固定頁的那一條 */
function RuleMenu({ name, rule }: { name: string; rule: NonNullable<PendingEntry["rule"]> }) {
  return (
    <MoreMenu label={`「${name}」的選項`}>
      <SkipButton name={name} ruleId={rule.ruleId} period={rule.period} inMenu />
      <Link href={editRecurringPath(rule.ruleId)} className="menu-item">
        <Icon name="pencil" className="size-4" />
        修改
      </Link>
    </MoreMenu>
  );
}
