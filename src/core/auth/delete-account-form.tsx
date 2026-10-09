"use client";

import { useActionState, useId } from "react";
import { ConfirmSubmitButton } from "../ui/confirm-submit-button";
import { FormFeedback, type FormState } from "../ui/form-message";
import { Icon } from "../ui/icon";
import { PasswordInput } from "../ui/password-input";
import { deleteAccountAction } from "./actions";

/** 要輸入目前的密碼，送出前再跳一次確認；成功後伺服器會刪掉 cookie 並導向登入頁 */
export function DeleteAccountForm({ username }: { username: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(deleteAccountAction, {});
  const passwordId = useId();

  return (
    <form action={action} className="stack">
      {/* 讓密碼管理工具知道是哪個帳號的密碼 */}
      <input type="text" name="username" value={username} autoComplete="username" readOnly hidden />
      {/* 密碼欄位裡有顯示密碼的按鈕，label 不能包住它，改用 htmlFor 對應 */}
      <div className="field">
        <label htmlFor={passwordId} className="field-label">
          目前的密碼
        </label>
        <PasswordInput id={passwordId} name="password" required autoComplete="current-password" />
      </div>
      <FormFeedback state={state} />
      <ConfirmSubmitButton confirmMessage={`確定要刪除帳號「${username}」嗎？刪除後無法復原。`} disabled={pending} className="btn-danger self-start">
        <Icon name="trash-2" className="size-4" />
        {pending ? "刪除中…" : "刪除帳號"}
      </ConfirmSubmitButton>
    </form>
  );
}
