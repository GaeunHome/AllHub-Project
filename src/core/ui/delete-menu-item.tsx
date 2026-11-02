"use client";

import { ActionButton } from "./action-button";
import type { FormState } from "./form-message";
import { Icon } from "./icon";

type DeleteMenuItemProps = {
  action: (previous: FormState, formData: FormData) => Promise<FormState>;
  id: number;
  confirmMessage: string;
  label: string;
  /** 伺服器沒給訊息時用這句 例如別的裝置已經刪掉了 */
  deletedMessage: string;
  /** 這一列會跟選單一起消失 訊息交給清單外面 */
  onDeleted: (message: string) => void;
};

/** ⋮ 選單裡的刪除 先跳確認 刪除後這一列會跟選單一起消失 */
export function DeleteMenuItem({ action, id, confirmMessage, label, deletedMessage, onDeleted }: DeleteMenuItemProps) {
  const run = async (previous: FormState, formData: FormData) => {
    const result = await action(previous, formData);
    if (!result.error) onDeleted(result.message ?? deletedMessage);
    return result;
  };

  return (
    <ActionButton
      action={run}
      fields={{ id }}
      confirmMessage={confirmMessage}
      formClassName="flex flex-col gap-1"
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
