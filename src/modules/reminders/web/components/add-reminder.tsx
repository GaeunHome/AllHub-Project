"use client";

import { Dialog, useDialog } from "@/core/ui/dialog";
import { Icon } from "@/core/ui/icon";
import type { DateLimits } from "../reminders-view";
import { ReminderForm } from "./reminder-form";

/**
 * 空狀態裡是主要按鈕 有清單時是卡片底下的小按鈕 打開的是同一個視窗
 * 新增第一個之後這個按鈕會跟著空狀態不見 焦點交給首頁卡片
 */
export function AddReminder({ today, latest, empty = false }: DateLimits & { empty?: boolean }) {
  const dialog = useDialog();

  return (
    <>
      <button
        {...dialog.triggerProps}
        // 只看得到新增兩個字 報讀器要知道是新增什麼
        aria-label={empty ? undefined : "新增提醒"}
        // 小按鈕用負邊距抵掉內距 字跟卡片內容的右邊線對齊
        className={empty ? "btn-primary" : "btn-ghost btn-sm -mr-3"}
      >
        <Icon name="plus" className="size-4" />
        {empty ? "新增提醒" : "新增"}
      </button>
      <Dialog {...dialog.dialogProps} title="新增提醒" size="sm">
        <ReminderForm today={today} latest={latest} onDone={dialog.done} onCancel={dialog.close} />
      </Dialog>
    </>
  );
}
