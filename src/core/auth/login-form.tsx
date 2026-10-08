"use client";

import { useActionState } from "react";
import { FormMessage } from "../ui/form-message";
import { Icon } from "../ui/icon";
import { login, type LoginState } from "./actions";

export function LoginForm() {
  const [state, action, pending] = useActionState<LoginState, FormData>(login, {});

  return (
    <form action={action} className="mt-7 flex flex-col gap-3 text-left">
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
      <label className="relative block">
        <span className="sr-only">密碼</span>
        <Icon name="lock" className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted" />
        <input type="password" name="password" placeholder="密碼" required autoComplete="current-password" className="input pl-11" />
      </label>
      {state.error && <FormMessage tone="error">{state.error}</FormMessage>}
      <button disabled={pending} className="btn-primary mt-1 w-full">
        {pending ? "登入中…" : "登入"}
      </button>
    </form>
  );
}
