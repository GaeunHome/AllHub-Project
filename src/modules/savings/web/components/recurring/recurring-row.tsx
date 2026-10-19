"use client";

import type { ReactNode } from "react";
import { Dialog, DialogMessage, useDialog } from "@/core/ui/dialog";
import { MoreMenu } from "@/core/ui/more-menu";
import { StatusChip } from "@/core/ui/status-chip";
import { deleteRecurringAction, setRecurringActiveAction } from "../../actions";
import { overdueBadge } from "../../format";
import { choosableAccounts } from "../../form-math";
import { SAVINGS_PATHS } from "../../paths";
import type { RecurringFormOptions, RecurringRowView } from "../../recurring-view";
import type { SalaryAccountOption } from "../forms/options";
import { RecurringForm } from "../forms/recurring-form";
import { SalaryForm } from "../forms/salary-dialog";
import { ConfirmForm } from "../pending/confirm-form";
import { ActiveMenuItem, DeleteMenuItem, DialogMenuItem, SkipButton } from "../row-controls";
import { useLinkedTrigger } from "../settings/open-from-link";

/** 清單外框 寬螢幕時每一列共用欄寬 金額與按鈕才對得齊 */
export const RECURRING_LIST = "card-list @2xl:grid @2xl:grid-cols-[minmax(0,1fr)_auto_auto] @2xl:gap-x-2";

// 手機兩列 名稱與金額一列 按鈕在下一列靠右 寬螢幕按鈕排在金額右邊
const ROW = "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 @2xl:col-span-3 @2xl:grid-cols-subgrid";

type RecurringRowProps = {
  row: RecurringRowView;
  /** 名稱前面的小圖 分類圖示或股票代號 */
  leading: ReactNode;
  title: ReactNode;
  detail: string;
  amountText: string;
  form: RecurringFormOptions;
  /** 薪水入帳並分配要的帳戶 */
  salaryAccounts?: SalaryAccountOption[];
  /** 到期時略過放在列上 不然收在 ⋮ */
  skipOnRow?: boolean;
  /** 從別頁的修改連過來 打開一次修改的視窗 */
  openFromLink?: boolean;
  /** 刪除或略過後按鈕會不見 訊息交給清單外面 */
  onNotice: (message: string) => void;
  /** 列下面多放的內容 例如薪水的分配 */
  children?: ReactNode;
};

/** 點名稱修改 到期的動作直接放在列上 停用與刪除收在 ⋮ */
export function RecurringRow({ row, leading, title, detail, amountText, form, salaryAccounts = [], skipOnRow = false, openFromLink = false, onNotice, children }: RecurringRowProps) {
  const edit = useDialog();
  const settle = useDialog();
  const editTrigger = useLinkedTrigger(edit, openFromLink, SAVINGS_PATHS.recurring);
  const { due, draft } = row;
  const overdue = due?.status === "overdue";
  const settleLabel = due?.salary ? "入帳並分配" : "確認";
  // 報讀器與確認視窗用規則的名稱 定期定額沒取名時是代號加定期定額
  const name = row.title;
  const badge = row.paused === "rule" ? "已停用" : row.paused === "account" ? "帳戶已停用" : null;

  return (
    // 列下面還有內容時不整列變色 不然看起來整塊都能點
    <li className={children ? ROW : `${ROW} transition-colors hover:bg-surface-muted`}>
      <button {...editTrigger} className="card-row flex min-h-14 min-w-0 cursor-pointer items-center gap-3 pr-0 text-left focus-visible:-outline-offset-2 sm:pr-0">
        <span className="sr-only">修改：</span>
        {leading}
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <span className={`font-medium break-words ${row.paused ? "text-ink-soft" : "text-ink"}`}>{title}</span>
            {badge && <span className="chip">{badge}</span>}
            {overdue && due && <StatusChip badge={overdueBadge(due.daysLeft)} />}
          </span>
          <span className="text-sm break-words text-ink-soft">{detail}</span>
        </span>
        <span className="shrink-0 text-right font-medium text-ink tabular-nums">{amountText}</span>
      </button>
      <div className="col-start-2 row-start-1 pr-3 sm:pr-4 @2xl:col-start-3">
        <MoreMenu label={`「${name}」的選項`}>
          <DialogMenuItem trigger={edit.triggerProps} icon="pencil" label="修改" />
          {due && !skipOnRow && <SkipButton name={name} ruleId={row.id} period={due.period} onSkipped={onNotice} inMenu />}
          <ActiveMenuItem action={setRecurringActiveAction} id={row.id} active={draft.active} pausedHint="停用後不會再記帳或提醒，已經記好的紀錄會留著" />
          <DeleteMenuItem
            action={deleteRecurringAction}
            id={row.id}
            confirmMessage={`確定刪除「${name} ${amountText}」？已經記好的紀錄會留著。`}
            label="刪除"
            deletedMessage={`已刪除「${name}」`}
            onDeleted={onNotice}
          />
        </MoreMenu>
      </div>
      {due && (
        <div className="col-span-2 row-start-2 flex flex-wrap items-center justify-end gap-2 px-5 pb-3 sm:px-6 @2xl:col-span-1 @2xl:col-start-2 @2xl:row-start-1 @2xl:px-0 @2xl:pb-0">
          <button {...settle.triggerProps} aria-label={`${settleLabel}：${name}`} className="btn-secondary btn-sm">
            {settleLabel}
          </button>
          {skipOnRow && <SkipButton name={name} ruleId={row.id} period={due.period} onSkipped={onNotice} />}
        </div>
      )}
      {children && <div className="col-span-full px-5 pb-4 sm:px-6">{children}</div>}
      <DialogMessage {...edit.messageProps} className="col-span-full px-5 pb-3 sm:px-6" />
      <DialogMessage {...settle.messageProps} className="col-span-full px-5 pb-3 sm:px-6" />
      <Dialog {...edit.dialogProps} title={`修改「${name}」`}>
        <RecurringForm
          rule={draft}
          accounts={choosableAccounts(form.accounts, draft.accountId, draft.counterAccountId)}
          categories={form.categories}
          holdings={choosableAccounts(form.holdings, draft.holdingId)}
          today={form.today}
          onDone={edit.done}
          onCancel={edit.close}
        />
      </Dialog>
      {due && (
        <Dialog {...settle.dialogProps} title={`${settleLabel}：${name}`} size={due.salary ? "lg" : "md"}>
          {due.confirm && <ConfirmForm draft={due.confirm} today={form.today} onDone={settle.done} onCancel={settle.close} />}
          {due.salary && <SalaryForm accounts={salaryAccounts} categories={form.categories} today={form.today} prefill={due.salary} onDone={settle.done} onCancel={settle.close} />}
        </Dialog>
      )}
    </li>
  );
}
