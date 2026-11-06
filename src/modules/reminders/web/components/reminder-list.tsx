"use client";

import { DeleteMenuItem } from "@/core/ui/delete-menu-item";
import { Dialog, useDialog } from "@/core/ui/dialog";
import { Icon } from "@/core/ui/icon";
import { MoreMenu } from "@/core/ui/more-menu";
import { REPEAT_OPTIONS } from "../../lib/rules";
import { deleteReminderAction } from "../actions";
import type { DateLimits, ReminderRowView, RemindersView } from "../reminders-view";
import { ReminderForm } from "./reminder-form";

/** 最近的幾個直接列出 其他的收起來 整個撐滿卡片的左右 */
export function ReminderList({ view }: { view: RemindersView }) {
  const { shown, more, today, latest } = view;
  return (
    <div className="card-list">
      <ReminderRows rows={shown} today={today} latest={latest} />
      {more.length > 0 && (
        <details className="disclosure">
          {/* 整列都能點 焦點框畫在列裡面 */}
          <summary className="card-row flex text-sm focus-visible:-outline-offset-2">還有 {more.length} 個</summary>
          {/* 接著上面的列排下去 不要 disclosure 展開內容的上邊距 */}
          <ReminderRows rows={more} today={today} latest={latest} className="mt-0 border-t border-line" />
        </details>
      )}
    </div>
  );
}

function ReminderRows({ rows, today, latest, className = "" }: DateLimits & { rows: ReminderRowView[]; className?: string }) {
  return (
    <ul className={`divide-y divide-line ${className}`}>
      {rows.map((row) => (
        <ReminderRow key={row.id} row={row} today={today} latest={latest} />
      ))}
    </ul>
  );
}

/** 今天最醒目 三天內用主色 其他中性 大數字一眼看得出還有多久 */
function countdownTone(days: number): string {
  if (days === 0) return "border-[var(--warning-line)] bg-[var(--warning-soft)] text-warning";
  if (days <= 3) return "border-[var(--brand-line)] bg-[var(--brand-soft)] text-brand-ink";
  return "border-line bg-[var(--surface-muted)] text-ink";
}

function CountdownTile({ days }: { days: number }) {
  const word = days === 0 ? "今天" : days === 1 ? "明天" : null;
  return (
    <span aria-hidden className={`grid size-13 shrink-0 place-content-center justify-items-center rounded-xl border leading-none ${countdownTone(days)}`}>
      {word ? (
        <b className="text-base">{word}</b>
      ) : (
        <>
          <b className="text-xl tabular-nums">{days}</b>
          <span className="mt-0.5 text-xs font-medium">天後</span>
        </>
      )}
    </span>
  );
}

/**
 * 右邊的內距交給 ⋮ 圖示才跟卡片內容的右緣對齊 視窗放在選單外面才不會跟著收起
 * 改了日期可能搬到收起來的清單 這一列連 ⋮ 一起換掉 焦點交給首頁卡片
 */
function ReminderRow({ row, today, latest }: DateLimits & { row: ReminderRowView }) {
  const edit = useDialog();

  return (
    <li className="card-row flex items-center gap-3 pr-3 sm:pr-4">
      <CountdownTile days={row.days} />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p title={row.title} className="truncate font-medium text-ink">
          {row.title}
        </p>
        <p className="flex flex-wrap items-center gap-x-2 text-sm text-ink-soft">
          <time dateTime={row.date} className="tabular-nums">
            {row.dateText}
          </time>
          {row.repeat !== "none" && <span className="chip">{REPEAT_OPTIONS.find(({ value }) => value === row.repeat)?.label}</span>}
        </p>
        <span className="sr-only">{row.countdown}</span>
      </div>
      <MoreMenu label={`「${row.title}」的選項`}>
        <button {...edit.triggerProps} className="menu-item">
          <Icon name="pencil" className="size-4" />
          修改
        </button>
        <DeleteMenuItem
          action={deleteReminderAction}
          fields={{ id: row.id }}
          confirmMessage={`確定刪除「${row.title}」？`}
          label="刪除"
          deletedMessage={`已刪除「${row.title}」`}
        />
      </MoreMenu>
      <Dialog {...edit.dialogProps} title={`修改「${row.title}」`} size="sm">
        <ReminderForm item={row} today={today} latest={latest} onDone={edit.done} onCancel={edit.close} />
      </Dialog>
    </li>
  );
}
