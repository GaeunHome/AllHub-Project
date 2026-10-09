"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { updateTags } from "../cache";
import { logError } from "../errors";
import { formText, runAction } from "../form";
import type { FormState } from "../ui/form-message";
import { createSession, deleteSession, requireSession } from ".";
import { INVITE_FAILURES, REGISTER_ATTEMPTS, checkAttempts, clientKey, recordAttempt } from "./attempts";
import { authTags } from "./cache-tags";
import { takeCaptchaToken, verifyCaptcha } from "./captcha";
import { CAPTCHA_ERROR, CAPTCHA_FIELD, HONEYPOT_FIELD, INVALID_CREDENTIALS } from "./messages";
import { clientIp, createFailureLimiter } from "./rate-limit";
import { registerMember, type RegisterResult } from "./registration";
import { authenticate, changePassword, deleteOwnAccount } from "./users";

export type LoginState = { error?: string; username?: string };
export type RegisterState = { error?: string; username?: string };

const LOCK_OPTIONS = { maxFailures: 5, windowMs: 15 * 60_000, lockMs: 15 * 60_000 };
// 同一個 IP 15 分鐘內錯 5 次就鎖 15 分鐘
const loginLimiter = createFailureLimiter(LOCK_OPTIONS);
// 改密碼要驗目前的密碼，依帳號計算：偷到 cookie 的人換 IP 也不能一直猜
const passwordLimiter = createFailureLimiter(LOCK_OPTIONS);
const FAILURE_DELAY_MS = 1000;

const lockedMessage = (retryAfterMs: number) => `錯誤次數太多，請 ${Math.ceil(retryAfterMs / 60_000)} 分鐘後再試`;
const tooManyAttempts = (retryAfterMs: number) => `嘗試次數太多，請 ${Math.ceil(retryAfterMs / 60_000)} 分鐘後再試`;

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const ip = clientIp((await headers()).get("x-forwarded-for"));
  // 每次送出都換一張驗證碼，被擋下的也一樣
  const captchaToken = await takeCaptchaToken("login");
  const gate = loginLimiter.check(ip);
  if (!gate.allowed) return { error: lockedMessage(gate.retryAfterMs) };

  const username = formText(formData, "username");
  let user: Awaited<ReturnType<typeof authenticate>>;
  try {
    // 驗證碼在密碼之前檢查：答錯時還沒查帳號，不算帳號的失敗次數，也看不出帳號是否存在；只算這個 IP 的一次失敗
    if (!(await verifyCaptcha("login", formText(formData, CAPTCHA_FIELD), captchaToken))) {
      loginLimiter.recordFailure(ip);
      return { error: CAPTCHA_ERROR, username };
    }
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
    // 帳號不存在、密碼錯誤、帳號鎖定中都用同一句，不透露帳號是否存在
    return { error: INVALID_CREDENTIALS, username };
  }

  loginLimiter.reset(ip);
  // 只有密碼正確才會走到這裡，說明已停用不會讓沒有密碼的人知道帳號存在
  if (user.disabled) return { error: "這個帳號已停用，請聯絡站長", username };
  await createSession(user.id, user.sessionVersion);
  redirect("/");
}

/** 只能用有效的邀請註冊；嘗試次數依 IP 的雜湊計算，存在資料庫（serverless 的記憶體不共用） */
export async function registerAction(_prev: RegisterState, formData: FormData): Promise<RegisterState> {
  const username = formText(formData, "username");
  // 每次送出都換一張驗證碼，被擋下的也一樣
  const captchaToken = await takeCaptchaToken("register");
  let result: RegisterResult;
  try {
    const now = new Date();
    const key = clientKey(clientIp((await headers()).get("x-forwarded-for")));
    // 成功失敗都算一次，機器人填了蜜罐也照樣用掉次數
    const gate = await recordAttempt(REGISTER_ATTEMPTS, key, now);
    if (!gate.allowed) return { error: tooManyAttempts(gate.retryAfterMs) };
    // 回一般的訊息，不告訴機器人是哪裡露餡
    if (formText(formData, HONEYPOT_FIELD) !== "") return { error: "無法完成註冊，請重新整理頁面再試一次" };
    if (!(await verifyCaptcha("register", formText(formData, CAPTCHA_FIELD), captchaToken, now))) return { error: CAPTCHA_ERROR, username };
    if (formData.get("agree") !== "on") return { error: "請先閱讀並勾選同意使用聲明", username };
    const inviteGate = await checkAttempts(INVITE_FAILURES, key, now);
    if (!inviteGate.allowed) return { error: tooManyAttempts(inviteGate.retryAfterMs) };

    result = await registerMember(
      { code: formText(formData, "code"), username, password: formText(formData, "password"), confirmPassword: formText(formData, "confirmPassword") },
      now,
    );
    if (!result.ok && result.reason === "invite") await recordAttempt(INVITE_FAILURES, key, now);
  } catch (error) {
    // 資料庫錯誤的 message 可能夾帶 SQL 參數（帳號、雜湊），log 只記錯誤種類
    logError("auth", "註冊時發生錯誤", error);
    return { error: "暫時無法註冊，請稍後再試", username };
  }

  if (!result.ok) return { error: result.error, username };
  updateTags(authTags.users, authTags.invites);
  await createSession(result.id, result.sessionVersion);
  redirect("/");
}

export async function logout(): Promise<void> {
  await deleteSession();
  redirect("/login");
}

/** 要再輸入一次密碼（跟改密碼共用錯誤次數限制）；最後一個站長不能刪除自己，由 deleteOwnAccount 檢查 */
export async function deleteAccountAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireSession();
  const gate = passwordLimiter.check(session.id);
  if (!gate.allowed) return { error: lockedMessage(gate.retryAfterMs) };

  const state = await runAction({ module: "auth", action: "刪除帳號" }, () => false, async () => {
    const result = await deleteOwnAccount(session.id, formText(formData, "password"));
    if (!result.ok) {
      if (result.reason === "wrong_password") passwordLimiter.recordFailure(session.id);
      return { error: result.error };
    }
    passwordLimiter.reset(session.id);
    updateTags(authTags.users, authTags.invites);
    await deleteSession();
  });
  if (state.error) return state;
  redirect("/login?deleted=1");
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
