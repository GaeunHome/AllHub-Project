"use client";

import { useActionState, useEffect, useId, useState } from "react";
import { thisPhoneEndpoint } from "../notifications/push-client";
import { FormFeedback, type FormState } from "../ui/form-message";
import { Icon } from "../ui/icon";
import { InfoTip } from "../ui/info-tip";
import { PasswordInput } from "../ui/password-input";
import { useToast } from "../ui/toast";
import { withToast } from "../ui/toast-queue";
import { changePasswordAction } from "./actions";
import { PASSWORD_CASE_RULE, PASSWORD_MIN_LENGTH } from "./password-rules";

const FIELDS = [
  { name: "currentPassword", label: "目前的密碼", autoComplete: "current-password" },
  { name: "newPassword", label: "新密碼", autoComplete: "new-password" },
  { name: "confirmPassword", label: "再輸入一次新密碼", autoComplete: "new-password" },
] as const;

/** 錯誤留在欄位下面 對著欄位修改 成功用提示視窗 */
export function ChangePasswordForm({ username }: { username: string }) {
  const toast = useToast();
  const [state, action, pending] = useActionState<FormState, FormData>(withToast(toast, changePasswordAction, { errors: false }), {});
  const id = useId();
  // 其他手機的通知跟著舊的登入一起失效 這支要留著
  const [endpoint, setEndpoint] = useState("");

  useEffect(() => {
    thisPhoneEndpoint()
      .then((value) => setEndpoint(value ?? ""))
      .catch(() => {});
  }, []);

  return (
    <form action={action} className="stack">
      <input type="hidden" name="pushEndpoint" value={endpoint} />
      {/* 讓密碼管理工具知道是哪個帳號的密碼 */}
      <input type="text" name="username" value={username} autoComplete="username" readOnly hidden />
      {/* 密碼欄位裡有按鈕 label 不能包住它 改用 htmlFor 對應 */}
      {FIELDS.map((field) => (
        <div key={field.name} className="field">
          <span className="flex items-center gap-1">
            <label htmlFor={`${id}-${field.name}`} className="field-label">
              {field.label}
            </label>
            {field.name === "newPassword" && <InfoTip label="新密碼的規則">至少 {PASSWORD_MIN_LENGTH} 字，{PASSWORD_CASE_RULE}，變更後其他裝置會登出</InfoTip>}
          </span>
          <PasswordInput
            id={`${id}-${field.name}`}
            name={field.name}
            required
            minLength={field.name === "currentPassword" ? undefined : PASSWORD_MIN_LENGTH}
            autoComplete={field.autoComplete}
          />
        </div>
      ))}
      <FormFeedback state={state} />
      <button disabled={pending} className="btn-primary self-start">
        <Icon name="key-round" className="size-4" />
        {pending ? "變更中…" : "變更密碼"}
      </button>
    </form>
  );
}
