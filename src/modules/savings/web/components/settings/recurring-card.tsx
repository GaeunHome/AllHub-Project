"use client";

import { Dialog, DialogMessage, useDialog } from "@/core/ui/dialog";
import { Icon } from "@/core/ui/icon";
import { MoreMenu } from "@/core/ui/more-menu";
import { CardHeader } from "@/core/ui/page-header";
import { formatSlashDate } from "../../../lib/dates";
import { deleteRecurringAction, setRecurringActiveAction } from "../../actions";
import { plannedAmount } from "../../entry-display";
import { choosableAccounts } from "../../form-math";
import { SAVINGS_PATHS } from "../../paths";
import type { AccountChoice, CategoryOption, HoldingOption, RecurringDraft } from "../forms/options";
import { RecurringForm } from "../forms/recurring-form";
import { ActiveMenuItem, DeleteMenuItem, LIST_ROW_MESSAGE, ListRow, useRemovalNotice } from "../row-controls";
import { useLinkedTrigger } from "./open-from-link";

/**
 * 伺服器整理好名稱與排程文字 已經照下一期的日期排好
 * nextDate 是下一期 停用的是 null accountPaused 是帳戶停用了 不會記帳也不會列進待處理
 */
export type RecurringItem = RecurringDraft & {
  title: string;
  schedule: string;
  nextDate: string | null;
  accountPaused: boolean;
};

type Options = { accounts: AccountChoice[]; categories: CategoryOption[]; holdings: HoldingOption[]; today: string };

type RecurringCardProps = {
  rules: RecurringItem[];
  /** 待處理的選單連過來時 打開一次這一條的修改視窗 伺服器已確認是自己的 */
  openId?: number | null;
} & Options;

export function RecurringCard({ rules, openId = null, accounts, categories, holdings, today }: RecurringCardProps) {
  const add = useDialog();
  const removal = useRemovalNotice();
  const active = choosableAccounts(accounts);

  return (
    <section aria-labelledby="savings-recurring" className="card stack overflow-hidden">
      <CardHeader
        id="savings-recurring"
        actions={
          active.length > 0 && (
            <button {...add.triggerProps} aria-label="新增固定收支" className="btn-secondary btn-sm">
              <Icon name="plus" className="size-4" />
              新增
            </button>
          )
        }
      >
        固定收支
      </CardHeader>
      <DialogMessage {...add.messageProps} />
      <DialogMessage {...removal.messageProps} />
      <Dialog {...add.dialogProps} title="新增固定收支">
        <RecurringForm accounts={active} categories={categories} holdings={choosableAccounts(holdings)} today={today} onDone={add.done} onCancel={add.close} />
      </Dialog>
      {rules.length === 0 ? (
        <p className="text-ink">{active.length > 0 ? "還沒有固定收支，按「新增」設定薪水、房租或訂閱。" : "先新增帳戶，才能設定固定收支。"}</p>
      ) : (
        <ul className="card-list">
          {rules.map((rule) => (
            <RecurringRow
              key={rule.id}
              rule={rule}
              accounts={choosableAccounts(accounts, rule.accountId, rule.counterAccountId)}
              categories={categories}
              holdings={choosableAccounts(holdings, rule.holdingId)}
              today={today}
              openFromLink={rule.id === openId}
              onDeleted={removal.report}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

type RecurringRowProps = { rule: RecurringItem; openFromLink: boolean; onDeleted: (message: string) => void } & Options;

function RecurringRow({ rule, accounts, categories, holdings, today, openFromLink, onDeleted }: RecurringRowProps) {
  const edit = useDialog();
  const trigger = useLinkedTrigger(edit, openFromLink, SAVINGS_PATHS.recurring);
  const amount = plannedAmount(rule.kind, rule.amount);
  const paused = !rule.active || rule.accountPaused;
  // 到期還沒確認的那一期在總覽的待處理 寫成下一期會看不懂為什麼是過去的日子
  const waiting = rule.nextDate !== null && rule.nextDate <= today && rule.mode === "confirm";
  const detail = [rule.schedule, !paused && rule.nextDate && `${waiting ? "待處理" : "下一期"} ${formatSlashDate(rule.nextDate)}`].filter(Boolean).join(" · ");

  return (
    <ListRow
      title={rule.title}
      detail={detail}
      amount={amount}
      badge={!rule.active ? <span className="chip">已停用</span> : rule.accountPaused && <span className="chip">帳戶已停用</span>}
      muted={paused}
      trigger={trigger}
      actionLabel="修改"
      menu={
        <MoreMenu label={`「${rule.title}」的選項`}>
          <ActiveMenuItem action={setRecurringActiveAction} id={rule.id} active={rule.active} pausedHint="停用後不會再記帳或提醒，已經記好的紀錄會留著" />
          <DeleteMenuItem
            action={deleteRecurringAction}
            id={rule.id}
            confirmMessage={`確定刪除固定收支「${rule.title} ${amount}」？已經記好的紀錄會留著。`}
            label="刪除固定收支"
            deletedMessage={`已刪除固定收支「${rule.title}」`}
            onDeleted={onDeleted}
          />
        </MoreMenu>
      }
    >
      <DialogMessage {...edit.messageProps} className={LIST_ROW_MESSAGE} />
      <Dialog {...edit.dialogProps} title={`修改「${rule.title}」`}>
        <RecurringForm rule={rule} accounts={accounts} categories={categories} holdings={holdings} today={today} onDone={edit.done} onCancel={edit.close} />
      </Dialog>
    </ListRow>
  );
}
