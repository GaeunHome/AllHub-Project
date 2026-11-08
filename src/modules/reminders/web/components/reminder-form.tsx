"use client";

import { useId } from "react";
import { useDialogForm } from "@/core/ui/dialog";
import { FormButtons } from "@/core/ui/form-buttons";
import { FormFeedback } from "@/core/ui/form-message";
import { InfoTip } from "@/core/ui/info-tip";
import { DEFAULT_NOTIFY, NOTIFY_OPTIONS, REPEAT_OPTIONS, notifyValueOf } from "../../lib/rules";
import type { ReminderItem } from "../../service/items";
import { createReminderAction, updateReminderAction } from "../actions";
import type { DateLimits } from "../reminders-view";

type ReminderFormProps = DateLimits & {
  /** 修改時傳那一個提醒 沒傳是新增 */
  item?: ReminderItem;
  onDone: (message: string | undefined) => void;
  onCancel: () => void;
};

/**
 * 瀏覽器只先擋空白與範圍 以伺服器的驗證為準
 * 不設 maxLength 它算 UTF-16 emoji 打不滿字數
 */
export function ReminderForm({ item, today, latest, onDone, onCancel }: ReminderFormProps) {
  const { state, pending, formProps } = useDialogForm(item ? updateReminderAction : createReminderAction, onDone);
  const dateId = useId();

  return (
    <form {...formProps} className="stack">
      {item && <input type="hidden" name="id" value={item.id} />}
      <label className="field">
        <span className="field-label">標題</span>
        <input name="title" required defaultValue={item?.title} placeholder="例如：繳房屋稅、媽媽生日" autoComplete="off" data-autofocus className="input" />
      </label>
      <div className="field">
        <span className="flex items-center gap-1">
          <label htmlFor={dateId} className="field-label">
            日期
          </label>
          <InfoTip label="日期的說明">不重複的提醒，日期過了隔天會自動刪除</InfoTip>
        </span>
        <input id={dateId} type="date" name="date" required defaultValue={item?.date} min={today} max={latest} className="input" />
      </div>
      <label className="field">
        <span className="field-label">通知</span>
        <select name="notifyDaysBefore" defaultValue={item ? notifyValueOf(item.notifyDaysBefore) : DEFAULT_NOTIFY} className="input">
          {NOTIFY_OPTIONS.map(({ value, label }) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span className="field-label">重複</span>
        <select name="repeat" defaultValue={item?.repeat ?? "none"} className="input">
          {REPEAT_OPTIONS.map(({ value, label }) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      {/* 成功就關掉視窗 這裡只放錯誤 重送時先收起上一次的 */}
      {!pending && <FormFeedback state={{ error: state.error }} />}
      <FormButtons pending={pending} onCancel={onCancel} label={item ? "儲存" : "新增"} icon={item ? "check" : "plus"} />
    </form>
  );
}
