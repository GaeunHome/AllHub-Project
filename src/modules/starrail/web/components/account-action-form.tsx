"use client";

import { useActionState, type ReactNode } from "react";
import { Icon, type UiIconName } from "@/core/ui/icon";
import { useToast } from "@/core/ui/toast";
import type { FormState } from "../actions";

/** 帳號卡片上的立即簽到與設定門檻 結果用提示視窗 失敗時標題寫哪個動作失敗 內容寫原因 */
export function AccountActionForm({
  action,
  accountId,
  label,
  pendingLabel,
  icon,
  children,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  accountId: number;
  label: string;
  pendingLabel: string;
  icon: UiIconName;
  children?: ReactNode;
}) {
  const toast = useToast();
  const [, formAction, pending] = useActionState<FormState, FormData>(async (previous, formData) => {
    const result = await action(previous, formData);
    if (result.error) toast.error(`${label}失敗`, result.error);
    else if (result.message) toast.success(result.message);
    return result;
  }, {});

  return (
    // contents 讓欄位與按鈕直接排進外層那一列 按鈕留在原位
    <form action={formAction} className="contents">
      <input type="hidden" name="accountId" value={accountId} />
      {children}
      {/* 跟旁邊的輸入框一樣是 44px 高 */}
      <button disabled={pending} className="btn-secondary">
        <Icon name={icon} className="size-4" />
        {pending ? pendingLabel : label}
      </button>
    </form>
  );
}
