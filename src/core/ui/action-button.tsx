"use client";

import { useActionState, type ComponentProps, type ReactNode } from "react";
import { ConfirmSubmitButton } from "./confirm-submit-button";
import { InlineFeedback, type FormState } from "./form-message";

type ActionButtonProps = Omit<ComponentProps<"button">, "children" | "type"> & {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  fields: Record<string, string | number>;
  /** 有給就先跳確認視窗，用在刪除這類無法復原的動作 */
  confirmMessage?: string;
  /** 處理中改顯示的內容，例如「刪除中…」 */
  pendingLabel?: ReactNode;
  /** 成功訊息用提示視窗顯示：刪除成功時這一列會在同一次更新裡消失，訊息放在列上看不到 */
  alertMessage?: boolean;
  /** 表單外框的排版；預設靠右對齊，放進選單時改成撐滿整列 */
  formClassName?: string;
  children: ReactNode;
};

/** 只有一個按鈕的小表單（啟用開關、調整順序、刪除）；成功時畫面會整個刷新，所以列上只顯示錯誤 */
export function ActionButton({
  action,
  fields,
  confirmMessage,
  pendingLabel,
  alertMessage = false,
  formClassName = "flex shrink-0 flex-col items-end gap-1",
  children,
  disabled,
  ...buttonProps
}: ActionButtonProps) {
  const withAlert = async (previous: FormState, formData: FormData) => {
    const result = await action(previous, formData);
    // effect 來不及在這一列消失前執行，所以在 action 回來時就跳
    if (result.message) window.alert(result.message);
    return result;
  };
  // 不用跳提示時直接交出 Server Action，JavaScript 還沒載入前表單也送得出去
  const [state, formAction, pending] = useActionState<FormState, FormData>(alertMessage ? withAlert : action, {});
  const button = { ...buttonProps, disabled: disabled || pending, children: pending && pendingLabel ? pendingLabel : children };

  return (
    <form action={formAction} className={formClassName}>
      {Object.entries(fields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      {confirmMessage ? <ConfirmSubmitButton confirmMessage={confirmMessage} {...button} /> : <button type="submit" {...button} />}
      <InlineFeedback error={state.error} className="max-w-48 text-right" />
    </form>
  );
}
