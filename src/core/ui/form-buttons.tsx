"use client";

import { Icon, type UiIconName } from "./icon";

type FormButtonsProps = { pending: boolean; onCancel: () => void; label?: string; pendingLabel?: string; icon?: UiIconName; disabled?: boolean };

/** 視窗表單最下面那一排 取消不會送出表單 送出中兩個都停用 */
export function FormButtons({ pending, onCancel, label = "儲存", pendingLabel = "儲存中…", icon = "check", disabled = false }: FormButtonsProps) {
  return (
    <div className="button-row justify-end">
      <button type="button" onClick={onCancel} disabled={pending} className="btn-ghost">
        取消
      </button>
      <button disabled={pending || disabled} className="btn-primary">
        <Icon name={icon} className="size-4" />
        {pending ? pendingLabel : label}
      </button>
    </div>
  );
}
