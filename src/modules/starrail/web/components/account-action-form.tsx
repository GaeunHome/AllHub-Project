"use client";

import { useActionState, type ReactNode } from "react";
import { InlineFeedback } from "@/core/ui/form-message";
import { Icon, type UiIconName } from "@/core/ui/icon";
import type { FormState } from "../actions";

/** 帳號卡片上的小表單（立即簽到、設定門檻），共用同一套結果顯示 */
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
  const [state, formAction, pending] = useActionState<FormState, FormData>(action, {});

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="accountId" value={accountId} />
      {children}
      <button disabled={pending} className="btn-secondary btn-sm">
        <Icon name={icon} className="size-3.5" />
        {pending ? pendingLabel : label}
      </button>
      <InlineFeedback {...state} />
    </form>
  );
}
