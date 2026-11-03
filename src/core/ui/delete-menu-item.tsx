"use client";

import { ActionButton } from "./action-button";
import type { FormState } from "./form-message";
import { Icon } from "./icon";

type DeleteMenuItemProps = {
  action: (previous: FormState, formData: FormData) => Promise<FormState>;
  id: number;
  confirmMessage: string;
  label: string;
  /** 伺服器沒給訊息時提示這句 例如別的裝置已經刪掉了 */
  deletedMessage: string;
};

/** ⋮ 選單裡的刪除 先跳確認 刪除後這一列跟著選單一起消失 結果用提示視窗 */
export function DeleteMenuItem({ action, id, confirmMessage, label, deletedMessage }: DeleteMenuItemProps) {
  return (
    <ActionButton
      action={action}
      fields={{ id }}
      confirmMessage={confirmMessage}
      successMessage={deletedMessage}
      formClassName="flex flex-col"
      pendingLabel={
        <>
          <Icon name="trash-2" className="size-4" />
          刪除中…
        </>
      }
      className="menu-item menu-item-danger"
    >
      <Icon name="trash-2" className="size-4" />
      {label}
    </ActionButton>
  );
}
