"use client";

import type { ReactNode } from "react";
import { DeleteMenuItem } from "@/core/ui/delete-menu-item";
import { Dialog, useDialog } from "@/core/ui/dialog";
import { MoreMenu } from "@/core/ui/more-menu";
import { StatusChip } from "@/core/ui/status-chip";
import { deleteRecurringAction, setRecurringActiveAction } from "../../actions";
import { overdueBadge, recurringNext } from "../../format";
import { choosableAccounts } from "../../form-math";
import { SAVINGS_PATHS } from "../../paths";
import type { RecurringFormOptions, RecurringRowView } from "../../recurring-view";
import type { SalaryAccountOption } from "../forms/options";
import { RecurringForm } from "../forms/recurring-form";
import { SalaryForm } from "../forms/salary-dialog";
import { ConfirmForm } from "../pending/confirm-form";
import { ActiveMenuItem, DialogMenuItem, SkipButton } from "../row-controls";
import { useLinkedTrigger } from "../settings/open-from-link";
import { Lines } from "../visuals";

type RecurringCardProps = {
  row: RecurringRowView;
  /** 名稱前面的小圖 分類圖示或股票代號 */
  leading: ReactNode;
  title: ReactNode;
  /** 名稱下面的幾行 排程與記帳方式 或從哪個帳戶扣 */
  detail: readonly string[];
  amountText: string;
  form: RecurringFormOptions;
  /** 薪水入帳並分配要的帳戶 */
  salaryAccounts?: SalaryAccountOption[];
  /** 到期時略過放在卡片上 不然收在 ⋮ */
  skipOnRow?: boolean;
  /** 從別頁的修改連過來 打開一次修改的視窗 */
  openFromLink?: boolean;
  /** 卡片多放的內容 例如薪水的分配 夠寬時排在右邊 */
  children?: ReactNode;
};

/** 點名稱修改 到期的動作直接放在卡片上 停用與刪除收在 ⋮ */
export function RecurringCard({ row, leading, title, detail, amountText, form, salaryAccounts = [], skipOnRow = false, openFromLink = false, children }: RecurringCardProps) {
  const edit = useDialog();
  const settle = useDialog();
  const editTrigger = useLinkedTrigger(edit, openFromLink, SAVINGS_PATHS.recurring);
  const { due, draft } = row;
  const overdue = due?.status === "overdue";
  const settleLabel = due?.salary ? "入帳並分配" : "確認";
  // 報讀器與確認視窗用規則的名稱 定期定額沒取名時是代號加定期定額
  const name = row.title;
  const badge = row.paused === "rule" ? "已停用" : row.paused === "account" ? "帳戶已停用" : null;
  const next = recurringNext(row);

  const main = (
    <>
      <div className="flex items-start gap-1">
        <button {...editTrigger} className="group flex min-w-0 flex-1 cursor-pointer items-start gap-3 rounded-lg text-left">
          <span className="sr-only">修改：</span>
          {leading}
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
              <span className={`font-semibold break-words underline-offset-4 group-hover:underline ${row.paused ? "text-ink-soft" : "text-ink"}`}>{title}</span>
              {badge && <span className="chip">{badge}</span>}
              {overdue && due && <StatusChip badge={overdueBadge(due.daysLeft)} />}
            </span>
            <span className="text-sm break-words text-ink-soft">
              <Lines lines={detail} />
            </span>
          </span>
        </button>
        <MoreMenu label={`「${name}」的選項`}>
          <DialogMenuItem trigger={edit.triggerProps} icon="pencil" label="修改" />
          {due && !skipOnRow && <SkipButton name={name} ruleId={row.id} period={due.period} inMenu />}
          <ActiveMenuItem action={setRecurringActiveAction} id={row.id} active={draft.active} pausedHint="停用後不會再記帳或提醒，已經記好的紀錄會留著" />
          <DeleteMenuItem
            action={deleteRecurringAction}
            fields={{ id: row.id }}
            confirmMessage={`確定刪除「${name} ${amountText}」？已經記好的紀錄會留著。`}
            label="刪除"
            deletedMessage={`已刪除「${name}」`}
          />
        </MoreMenu>
      </div>
      {/* 左邊是多少錢 右邊是什麼時候 */}
      <div className="flex flex-1 flex-wrap items-end justify-between gap-x-4 gap-y-1">
        <p className="text-2xl font-bold tracking-tight text-ink tabular-nums">{amountText}</p>
        {next.length > 0 && (
          <span className="text-right text-sm text-ink-soft tabular-nums">
            <Lines lines={next} />
          </span>
        )}
      </div>
      {due && (
        <div className="button-row">
          <button {...settle.triggerProps} aria-label={`${settleLabel}：${name}`} className="btn-secondary btn-sm">
            {settleLabel}
          </button>
          {skipOnRow && <SkipButton name={name} ruleId={row.id} period={due.period} />}
        </div>
      )}
    </>
  );

  return (
    // 有分配的薪水佔兩格 不然分配擠在一張卡裡
    <li className={children ? "card @container flex min-w-0 flex-col sm:col-span-2" : "card flex min-w-0 flex-col gap-3"}>
      {children ? (
        <div className="grid items-start gap-5 @2xl:grid-cols-2">
          <div className="flex min-w-0 flex-col gap-3">{main}</div>
          {children}
        </div>
      ) : (
        main
      )}
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
