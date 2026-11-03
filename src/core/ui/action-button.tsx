"use client";

import { useActionState, type ComponentProps, type ReactNode } from "react";
import { ConfirmSubmitButton } from "./confirm-submit-button";
import { keepFocusInFrame } from "./focus-frame";
import type { FormState } from "./form-message";
import { useToast } from "./toast";
import { withToast } from "./toast-queue";

/** 送出中不設 disabled 停用的按鈕會丟掉焦點 改成標 aria-disabled 並變淡 */
export const BUSY_CLASS = "aria-disabled:cursor-wait aria-disabled:opacity-55";

type ActionButtonProps = Omit<ComponentProps<"button">, "children" | "type" | "onClick"> & {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  fields: Record<string, string | number>;
  /** 有給就先跳確認視窗 用在刪除這類無法復原的動作 */
  confirmMessage?: string;
  /** 處理中改顯示的內容 例如刪除中 */
  pendingLabel?: ReactNode;
  /** 伺服器沒給訊息時成功了用這句 例如刪除後這一列跟著不見 */
  successMessage?: string;
  /** 表單外框的排版 放進選單時改成撐滿整列 */
  formClassName?: string;
  children: ReactNode;
};

/**
 * 只有一個按鈕的小表單 成功與失敗都用提示視窗
 * 成功後這一列常會跟著不見 焦點交給最近的外框
 */
export function ActionButton({ action, fields, confirmMessage, pendingLabel, successMessage, formClassName = "flex shrink-0", className = "", children, ...buttonProps }: ActionButtonProps) {
  const toast = useToast();
  const [, formAction, pending] = useActionState<FormState, FormData>(withToast(toast, action, { fallback: successMessage }), {});
  const button = {
    ...buttonProps,
    "aria-disabled": pending || undefined,
    // 送出中再按不會重複送出 要確認的也不再跳確認
    onClick: (event: { preventDefault: () => void }) => {
      if (pending) event.preventDefault();
    },
    className: pending ? `${className} ${BUSY_CLASS}`.trim() : className,
    children: pending && pendingLabel ? pendingLabel : children,
  };

  return (
    <form ref={keepFocusInFrame} action={formAction} className={formClassName}>
      {Object.entries(fields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      {confirmMessage ? <ConfirmSubmitButton confirmMessage={confirmMessage} {...button} /> : <button type="submit" {...button} />}
    </form>
  );
}
