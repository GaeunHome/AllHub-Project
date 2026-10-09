"use client";

import Link from "next/link";
import { useActionState, useId } from "react";
import { FormMessage } from "../ui/form-message";
import { Icon } from "../ui/icon";
import { PasswordInput } from "../ui/password-input";
import { registerAction, type RegisterState } from "./actions";
import { CaptchaField } from "./captcha-field";
import { HONEYPOT_FIELD } from "./messages";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "./password-rules";

export function RegisterForm({ code, expiresAt, captchaSrc }: { code: string; expiresAt: string; captchaSrc: string }) {
  const [state, action, pending] = useActionState<RegisterState, FormData>(registerAction, {});
  const id = useId();

  return (
    <form action={action} className="stack">
      <input type="hidden" name="code" value={code} />
      <p className="text-center">這個邀請連結有效到 {expiresAt}</p>
      <label className="field">
        <span className="field-label">帳號</span>
        {/* 送出後 React 會重設表單，用 key 讓帳號欄位帶回剛才輸入的值 */}
        <input
          key={state.username ?? ""}
          name="username"
          defaultValue={state.username}
          required
          minLength={3}
          maxLength={32}
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          className="input"
        />
      </label>
      {/* 密碼欄位裡有顯示密碼的按鈕，label 不能包住它，改用 htmlFor 對應 */}
      <div className="field">
        <label htmlFor={`${id}-password`} className="field-label">
          密碼
        </label>
        <PasswordInput id={`${id}-password`} name="password" required minLength={PASSWORD_MIN_LENGTH} autoComplete="new-password" />
      </div>
      <div className="field">
        <label htmlFor={`${id}-confirm`} className="field-label">
          再輸入一次密碼
        </label>
        <PasswordInput id={`${id}-confirm`} name="confirmPassword" required minLength={PASSWORD_MIN_LENGTH} autoComplete="new-password" />
      </div>
      {/* 規則收起來，畫面上不放一排小字；送出時不符合會直接說明是哪一條 */}
      <details className="disclosure">
        <summary>帳號與密碼的規則</summary>
        <ul className="flex list-disc flex-col gap-1 pl-5">
          <li>帳號 3–32 個字元，只能用英文小寫、數字、底線（_）、點（.）與連字號（-）</li>
          <li>
            密碼 {PASSWORD_MIN_LENGTH}–{PASSWORD_MAX_LENGTH} 個字元，不能是常見的密碼，也不能包含帳號名稱
          </li>
        </ul>
      </details>
      {/* 蜜罐：移到畫面外、不能用 Tab 選到，也不讓報讀器念出來；只有自動填表的機器人會填 */}
      <div aria-hidden className="absolute -left-[9999px] size-px overflow-hidden">
        <label>
          個人網站
          <input type="text" name={HONEYPOT_FIELD} tabIndex={-1} autoComplete="off" defaultValue="" />
        </label>
      </div>
      <CaptchaField src={captchaSrc} resetSignal={state} />
      {/* 整列都可以點，高度至少 44px */}
      <label className="flex min-h-11 cursor-pointer items-center gap-3">
        <input type="checkbox" name="agree" required className="size-4 shrink-0" />
        <span>
          我已閱讀並同意
          <Link href="/terms" target="_blank" className="link">
            使用聲明
          </Link>
          （另開新分頁）
        </span>
      </label>
      {state.error && <FormMessage tone="error">{state.error}</FormMessage>}
      <button disabled={pending} className="btn-primary w-full">
        <Icon name="circle-user-round" className="size-4" />
        {pending ? "建立中…" : "建立帳號"}
      </button>
    </form>
  );
}
