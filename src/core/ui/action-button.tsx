"use client";

import { useActionState, type ComponentProps, type ReactNode } from "react";
import { ConfirmSubmitButton } from "./confirm-submit-button";
import { FormFeedback, InlineFeedback, type FormState } from "./form-message";

type ActionButtonProps = Omit<ComponentProps<"button">, "children" | "type"> & {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  fields: Record<string, string | number>;
  /** 有給就先跳確認視窗 用在刪除這類無法復原的動作 */
  confirmMessage?: string;
  /** 處理中改顯示的內容 例如刪除中 */
  pendingLabel?: ReactNode;
  /** 成功訊息改用提示視窗 刪除成功時這一列會跟著消失 放在列上看不到 */
  alertMessage?: boolean;
  /**
   * 成功的訊息也顯示 用在成功後畫面不會變的動作 例如續訂 重新檢查字幕
   * inline 是按鈕旁的小字 block 是按鈕下方的 FormFeedback 送出中先收起上一次的結果
   */
  showMessage?: "inline" | "block";
  /** 表單外框的排版 預設靠右 放進選單時改成撐滿整列 */
  formClassName?: string;
  /** 按鈕旁小字的排版 預設靠右限寬 */
  feedbackClassName?: string;
  children: ReactNode;
};

/** 只有一個按鈕的小表單 成功時畫面多半會整個刷新 所以預設只顯示錯誤 */
export function ActionButton({
  action,
  fields,
  confirmMessage,
  pendingLabel,
  alertMessage = false,
  showMessage,
  formClassName = "flex shrink-0 flex-col items-end gap-1",
  feedbackClassName = "max-w-48 text-right",
  children,
  disabled,
  ...buttonProps
}: ActionButtonProps) {
  const withAlert = async (previous: FormState, formData: FormData) => {
    const result = await action(previous, formData);
    // effect 來不及在這一列消失前執行 所以在 action 回來時就跳
    if (result.message) window.alert(result.message);
    return result;
  };
  // 不用跳提示時直接交出 Server Action JavaScript 還沒載入前也送得出去
  const [state, formAction, pending] = useActionState<FormState, FormData>(alertMessage ? withAlert : action, {});
  const button = { ...buttonProps, disabled: disabled || pending, children: pending && pendingLabel ? pendingLabel : children };

  return (
    <form action={formAction} className={formClassName}>
      {Object.entries(fields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      {confirmMessage ? <ConfirmSubmitButton confirmMessage={confirmMessage} {...button} /> : <button type="submit" {...button} />}
      {showMessage === undefined ? (
        <InlineFeedback error={state.error} className={feedbackClassName} />
      ) : (
        !pending && (showMessage === "inline" ? <InlineFeedback {...state} className={feedbackClassName} /> : <FormFeedback state={state} />)
      )}
    </form>
  );
}
