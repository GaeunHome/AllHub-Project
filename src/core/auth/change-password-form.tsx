"use client";

import { useActionState, useId } from "react";
import { FormFeedback, type FormState } from "../ui/form-message";
import { Icon } from "../ui/icon";
import { PasswordInput } from "../ui/password-input";
import { changePasswordAction } from "./actions";
import { PASSWORD_MIN_LENGTH } from "./password-rules";

const FIELDS = [
  { name: "currentPassword", label: "目前的密碼", autoComplete: "current-password" },
  { name: "newPassword", label: "新密碼", autoComplete: "new-password" },
  { name: "confirmPassword", label: "再輸入一次新密碼", autoComplete: "new-password" },
] as const;

export function ChangePasswordForm({ username }: { username: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(changePasswordAction, {});
  const id = useId();

  return (
    <form action={action} className="stack">
      {/* 讓密碼管理工具知道是哪個帳號的密碼 */}
      <input type="text" name="username" value={username} autoComplete="username" readOnly hidden />
      {/* 密碼欄位裡有顯示密碼的按鈕，label 不能包住它，改用 htmlFor 對應 */}
      {FIELDS.map((field) => (
        <div key={field.name} className="field">
          <label htmlFor={`${id}-${field.name}`} className="field-label">
            {field.label}
          </label>
          <PasswordInput
            id={`${id}-${field.name}`}
            name={field.name}
            required
            minLength={field.name === "currentPassword" ? undefined : PASSWORD_MIN_LENGTH}
            autoComplete={field.autoComplete}
          />
        </div>
      ))}
      <p className="text-sm text-ink-soft">新密碼至少 {PASSWORD_MIN_LENGTH} 個字元；變更後其他裝置都會被登出。</p>
      <FormFeedback state={state} />
      <button disabled={pending} className="btn-primary self-start">
        <Icon name="key-round" className="size-4" />
        {pending ? "變更中…" : "變更密碼"}
      </button>
    </form>
  );
}
