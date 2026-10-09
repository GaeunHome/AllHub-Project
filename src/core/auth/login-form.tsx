"use client";

import { useActionState, useId } from "react";
import { FormMessage } from "../ui/form-message";
import { Icon } from "../ui/icon";
import { PasswordInput } from "../ui/password-input";
import { login, type LoginState } from "./actions";
import { CaptchaField } from "./captcha-field";
import { credentialsHint } from "./messages";

export function LoginForm({ captchaSrc }: { captchaSrc: string }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(login, {});
  const passwordId = useId();

  return (
    <form action={action} className="stack">
      <label className="relative block">
        <span className="sr-only">帳號</span>
        <Icon name="circle-user-round" className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted" />
        {/* 送出後 React 會重設表單，用 key 讓帳號欄位帶回剛才輸入的值 */}
        <input
          key={state.username ?? ""}
          name="username"
          defaultValue={state.username}
          placeholder="帳號"
          required
          autoFocus
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          className="input pl-11"
        />
      </label>
      {/* 密碼欄位裡有顯示密碼的按鈕，label 不能包住它，改用 htmlFor 對應 */}
      <div className="relative">
        <label htmlFor={passwordId} className="sr-only">
          密碼
        </label>
        <Icon name="lock" className="pointer-events-none absolute top-1/2 left-4 z-10 size-4 -translate-y-1/2 text-muted" />
        <PasswordInput id={passwordId} name="password" placeholder="密碼" required autoComplete="current-password" className="input pl-11" />
      </div>
      <CaptchaField src={captchaSrc} resetSignal={state} hiddenLabel />
      {state.error && <FormMessage tone="error">{state.error}</FormMessage>}
      {credentialsHint(state.error) && <p className="leading-relaxed">{credentialsHint(state.error)}</p>}
      <button disabled={pending} className="btn-primary w-full">
        {pending ? "登入中…" : "登入"}
      </button>
    </form>
  );
}
