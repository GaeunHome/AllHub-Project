"use client";

import { useActionState } from "react";
import { FormFeedback, type FormState } from "../ui/form-message";
import { Icon } from "../ui/icon";
import { changePasswordAction } from "./actions";
import { PASSWORD_MIN_LENGTH } from "./password-rules";

const FIELDS = [
  { name: "currentPassword", label: "目前的密碼", autoComplete: "current-password" },
  { name: "newPassword", label: "新密碼", autoComplete: "new-password" },
  { name: "confirmPassword", label: "再輸入一次新密碼", autoComplete: "new-password" },
] as const;

export function ChangePasswordForm({ username }: { username: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(changePasswordAction, {});

  return (
    <form action={action} className="flex flex-col gap-4">
      {/* 讓密碼管理工具知道是哪個帳號的密碼 */}
      <input type="text" name="username" value={username} autoComplete="username" readOnly hidden />
      {FIELDS.map((field) => (
        <label key={field.name} className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-ink-soft">{field.label}</span>
          <input
            type="password"
            name={field.name}
            required
            minLength={field.name === "currentPassword" ? undefined : PASSWORD_MIN_LENGTH}
            autoComplete={field.autoComplete}
            className="input"
          />
        </label>
      ))}
      <p className="text-xs text-muted">新密碼至少 {PASSWORD_MIN_LENGTH} 個字元。變更後這台裝置保持登入，其他裝置都會被登出。</p>
      <FormFeedback state={state} />
      <button disabled={pending} className="btn-primary self-start">
        <Icon name="key-round" className="size-4" />
        {pending ? "變更中…" : "變更密碼"}
      </button>
    </form>
  );
}
