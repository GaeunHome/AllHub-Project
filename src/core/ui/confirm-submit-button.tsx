"use client";

import type { ComponentProps } from "react";

/** 送出前先跳確認視窗；取消就不送出。用在刪除這類無法復原的動作。 */
export function ConfirmSubmitButton({ confirmMessage, onClick, ...props }: ComponentProps<"button"> & { confirmMessage: string }) {
  return (
    <button
      type="submit"
      {...props}
      onClick={(e) => {
        if (!window.confirm(confirmMessage)) e.preventDefault();
        onClick?.(e);
      }}
    />
  );
}
