"use client";

import { Dialog, DialogMessage, useDialog } from "@/core/ui/dialog";
import { EmptyState } from "@/core/ui/empty-state";
import { Icon } from "@/core/ui/icon";
import { MoreMenu } from "@/core/ui/more-menu";
import { CardHeader } from "@/core/ui/page-header";
import { formatDay } from "../../../lib/dates";
import { TRANSACTION_KIND_LABELS, type PaletteColor } from "../../../lib/kinds";
import { deleteRecurringAction, setRecurringActiveAction } from "../../actions";
import { AMOUNT_TONE_CLASS, entryDetails, entryTitle, scheduleLabel, signedAmount } from "../../entry-display";
import { choosableAccounts } from "../../form-math";
import { ColorDot } from "../color-dot";
import type { AccountChoice, CategoryOption, RecurringDraft } from "../forms/options";
import { RecurringForm } from "../forms/recurring-form";
import { TRANSACTION_KIND_ICONS } from "../kind-icon";
import { ActiveMenuItem, DeleteMenuItem, EditButton, useRemovalNotice } from "../row-controls";

/**
 * 名稱由伺服器 join 好 nextDate 是下次自動記的日期 停用的是 null
 * accountPaused 是帳戶已停用 排程會略過
 */
export type RecurringItem = RecurringDraft & {
  accountName: string;
  counterAccountName: string | null;
  categoryName: string | null;
  categoryColor: PaletteColor | null;
  nextDate: string | null;
  accountPaused: boolean;
};

type Options = { accounts: AccountChoice[]; categories: CategoryOption[]; today: string };

export function RecurringCard({ rules, accounts, categories, today }: { rules: RecurringItem[] } & Options) {
  const add = useDialog();
  const removal = useRemovalNotice();
  const active = choosableAccounts(accounts);

  return (
    <section aria-labelledby="savings-recurring" className="card stack">
      <CardHeader
        id="savings-recurring"
        icon={<Icon name="repeat" />}
        actions={
          active.length > 0 && (
            <button {...add.triggerProps} className="btn-secondary btn-sm">
              <Icon name="plus" className="size-4" />
              新增固定收支
            </button>
          )
        }
      >
        固定收支
      </CardHeader>
      <DialogMessage {...add.messageProps} />
      <DialogMessage {...removal.messageProps} />
      <Dialog {...add.dialogProps} title="新增固定收支" icon={<Icon name="plus" />}>
        <RecurringForm accounts={active} categories={categories} today={today} onDone={add.done} onCancel={add.close} />
      </Dialog>
      {rules.length === 0 ? (
        <EmptyState
          compact
          icon="repeat"
          title="還沒有固定收支"
          hint={active.length > 0 ? "例如每月 5 日的薪水、10 日的定期定額、房租與訂閱；每天凌晨會自動記上當天該記的。" : "先新增帳戶，才能設定每月自動記的收支。"}
        />
      ) : (
        <ul className="card-list">
          {rules.map((rule) => (
            <RecurringRow key={rule.id} rule={rule} accounts={choosableAccounts(accounts, rule.accountId, rule.counterAccountId)} categories={categories} today={today} onDeleted={removal.report} />
          ))}
        </ul>
      )}
    </section>
  );
}

function RecurringRow({ rule, accounts, categories, today, onDeleted }: { rule: RecurringItem; onDeleted: (message: string) => void } & Options) {
  const edit = useDialog();
  const title = entryTitle(rule);
  const amount = signedAmount(rule.kind, rule.amount);
  const schedule = scheduleLabel(rule.dayOfMonth);
  // 有分類時前面只有色點 所以類型要寫出來
  const detail = [TRANSACTION_KIND_LABELS[rule.kind], ...entryDetails(rule), rule.nextDate && !rule.accountPaused ? `下次：${formatDay(rule.nextDate)}` : null].filter(Boolean).join(" · ");

  return (
    <li className="card-row stack">
      {/* 跟紀錄的一列一樣 手機兩行 寬螢幕金額與按鈕在右邊垂直置中 */}
      <div className="grid grid-cols-[1.25rem_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 sm:grid-cols-[1.25rem_minmax(0,1fr)_auto_auto]">
        <span className="col-start-1 row-span-2 row-start-1 grid place-items-center">
          {rule.categoryColor ? <ColorDot color={rule.categoryColor} className="size-3" /> : <Icon name={TRANSACTION_KIND_ICONS[rule.kind]} className="size-4 text-ink-soft" />}
        </span>
        <p className="col-start-2 row-start-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <span className="chip chip-accent tabular-nums">{schedule}</span>
          <span className={`font-semibold break-words ${rule.active ? "text-ink" : "text-ink-soft"}`}>{title}</span>
          {!rule.active && <span className="chip chip-warning">已停用</span>}
          {rule.active && rule.accountPaused && <span className="chip chip-warning">帳戶已停用，不會自動記</span>}
        </p>
        {detail && <p className="col-start-2 row-start-2 text-sm break-words text-ink-soft">{detail}</p>}
        <span className={`col-start-3 row-start-1 text-right font-semibold tabular-nums sm:row-span-2 ${AMOUNT_TONE_CLASS[amount.tone]}`}>{amount.text}</span>
        <div className="col-start-3 row-start-2 flex items-center justify-end gap-1 sm:col-start-4 sm:row-span-2 sm:row-start-1">
          <EditButton name={title} {...edit.triggerProps} />
          <MoreMenu label={`「${title}」的選項`}>
            <ActiveMenuItem action={setRecurringActiveAction} id={rule.id} active={rule.active} pausedHint="停用後不會再自動記，已經記好的紀錄會留著" />
            <DeleteMenuItem
              action={deleteRecurringAction}
              id={rule.id}
              confirmMessage={`確定刪除固定收支「${schedule} ${title} ${amount.text}」？已經自動記好的紀錄會留著，只是不再標「自動」。`}
              label="刪除固定收支"
              deletedMessage={`已刪除固定收支「${schedule} ${title}」`}
              onDeleted={onDeleted}
            />
          </MoreMenu>
        </div>
      </div>
      <DialogMessage {...edit.messageProps} />
      <Dialog {...edit.dialogProps} title="修改固定收支" icon={<Icon name="pencil" />}>
        <RecurringForm rule={rule} accounts={accounts} categories={categories} today={today} onDone={edit.done} onCancel={edit.close} />
      </Dialog>
    </li>
  );
}
