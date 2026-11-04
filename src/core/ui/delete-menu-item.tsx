"use client";

import { ActionButton } from "./action-button";
import type { FormState } from "./form-message";
import { Icon } from "./icon";

type DeleteMenuItemProps = {
  action: (previous: FormState, formData: FormData) => Promise<FormState>;
  /** 跟著表單送出的欄位 通常是 id */
  fields: Record<string, string | number>;
  confirmMessage: string;
  label: string;
  pendingLabel?: string;
  /** 伺服器沒給訊息時提示這句 例如別的裝置已經刪掉了 沒給時那一列不見就是結果 */
  deletedMessage?: string;
};

/** ⋮ 選單裡的刪除 先跳確認 刪除後這一列跟著選單一起消失 結果用提示視窗 */
export function DeleteMenuItem({ action, fields, confirmMessage, label, pendingLabel = "刪除中…", deletedMessage }: DeleteMenuItemProps) {
  return (
    <ActionButton
      action={action}
      fields={fields}
      confirmMessage={confirmMessage}
      successMessage={deletedMessage}
      formClassName="flex flex-col"
      pendingLabel={
        <>
          <Icon name="trash-2" className="size-4" />
          {pendingLabel}
        </>
      }
      className="menu-item menu-item-danger"
    >
      <Icon name="trash-2" className="size-4" />
      {label}
    </ActionButton>
  );
}
