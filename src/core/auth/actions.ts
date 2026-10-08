"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { logError } from "../errors";
import { formText, runAction } from "../form";
import type { FormState } from "../ui/form-message";
import { createSession, deleteSession, requireSession } from ".";
import { clientIp, createFailureLimiter } from "./rate-limit";
import { authenticate, changePassword } from "./users";

export type LoginState = { error?: string; username?: string };

const LOCK_OPTIONS = { maxFailures: 5, windowMs: 15 * 60_000, lockMs: 15 * 60_000 };
// 同一個 IP 15 分鐘內錯 5 次就鎖 15 分鐘
const loginLimiter = createFailureLimiter(LOCK_OPTIONS);
// 改密碼要驗目前的密碼，依帳號計算：偷到 cookie 的人換 IP 也不能一直猜
const passwordLimiter = createFailureLimiter(LOCK_OPTIONS);
const FAILURE_DELAY_MS = 1000;

const lockedMessage = (retryAfterMs: number) => `錯誤次數太多，請 ${Math.ceil(retryAfterMs / 60_000)} 分鐘後再試`;

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const ip = clientIp((await headers()).get("x-forwarded-for"));
  const gate = loginLimiter.check(ip);
  if (!gate.allowed) return { error: lockedMessage(gate.retryAfterMs) };

  const username = formText(formData, "username");
  let user: Awaited<ReturnType<typeof authenticate>>;
  try {
    user = await authenticate(username, formText(formData, "password"));
  } catch (error) {
    // 資料庫錯誤的 message 可能帶連線字串，log 只記錯誤種類
    logError("auth", "登入時發生錯誤", error);
    return { error: "暫時無法登入，請稍後再試", username };
  }

  if (!user) {
    loginLimiter.recordFailure(ip);
    // 拖慢單一連線的連續猜測
    await new Promise((resolve) => setTimeout(resolve, FAILURE_DELAY_MS));
    // 帳號不存在與密碼錯誤用同一句，不透露帳號是否存在
    return { error: "帳號或密碼錯誤", username };
  }

  loginLimiter.reset(ip);
  await createSession(user.id, user.sessionVersion);
  redirect("/");
}

export async function logout(): Promise<void> {
  await deleteSession();
  redirect("/login");
}

export async function changePasswordAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireSession();
  const newPassword = formText(formData, "newPassword");
  if (newPassword !== formText(formData, "confirmPassword")) return { error: "兩次輸入的新密碼不一樣" };

  const gate = passwordLimiter.check(session.id);
  if (!gate.allowed) return { error: lockedMessage(gate.retryAfterMs) };

  // 密碼錯誤與不合規則由 changePassword 用結果回傳，丟出來的都是預期外的錯誤
  return runAction({ module: "auth", action: "變更密碼" }, () => false, async () => {
    const result = await changePassword(session.id, formText(formData, "currentPassword"), newPassword);
    if (!result.ok) {
      if (result.reason === "wrong_password") passwordLimiter.recordFailure(session.id);
      return { error: result.error };
    }
    passwordLimiter.reset(session.id);
    // 版本已遞增，其他裝置的 cookie 失效；這台換發新版本的 cookie 繼續登入
    await createSession(session.id, result.sessionVersion);
    return "已變更密碼。這台裝置保持登入，其他裝置都已登出。";
  });
}
