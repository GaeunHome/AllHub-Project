"use client";

import type { ComponentProps } from "react";

/** 送出前先確認 用在刪除這類無法復原的動作 外面已經擋下這次送出時不再問 */
export function ConfirmSubmitButton({ confirmMessage, onClick, ...props }: ComponentProps<"button"> & { confirmMessage: string }) {
  return (
    <button
      type="submit"
      {...props}
      onClick={(e) => {
        onClick?.(e);
        if (!e.defaultPrevented && !window.confirm(confirmMessage)) e.preventDefault();
      }}
    />
  );
}
