"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { runAction } from "../action";
import { ANONYMOUS_ACTOR, audit, auditActor, auditLoginFailure, auditMergedFailure, type AuditActor } from "../audit";
import { updateTags } from "../cache";
import { logError } from "../errors";
import { formText } from "../form";
import type { FormState } from "../ui/form-message";
import { createSession, deleteSession, requireSession } from ".";
import { INVITE_FAILURES, REGISTER_ATTEMPTS, checkAttempts, clientKey, recordAttempt } from "./attempts";
import { authTags } from "./cache-tags";
import { takeCaptchaToken, verifyCaptcha } from "./captcha";
import { CAPTCHA_ERROR, CAPTCHA_FIELD, HONEYPOT_FIELD, INVALID_CREDENTIALS, safeNextPath, tooManyAttempts } from "./messages";
import { normalizeUsername } from "./credentials";
import { clientIp, createFailureLimiter } from "./rate-limit";
import { registerMember, type RegisterResult } from "./registration";
import { KEEP_AVATAR } from "./avatar-rules";
import { removeOtherSubscriptions } from "../push/service";
import { authenticate, changePassword, deleteOwnAccount, saveUploadedAvatar, updateAvatar, updateNickname } from "./users";

export type LoginState = { error?: string; username?: string };
export type RegisterState = { error?: string; username?: string };

const LOCK_OPTIONS = { maxFailures: 5, windowMs: 15 * 60_000, lockMs: 15 * 60_000 };
// 同一個 IP 15 分鐘內錯 5 次就鎖 15 分鐘
const loginLimiter = createFailureLimiter(LOCK_OPTIONS);
// 改密碼依帳號計算 偷到 cookie 的人換 IP 也不能一直猜
const passwordLimiter = createFailureLimiter(LOCK_OPTIONS);
const FAILURE_DELAY_MS = 1000;

const guest = (ip: string): AuditActor => ({ id: null, name: ANONYMOUS_ACTOR, ip });
const REGISTER_FAILURES = { invite: "邀請連結無效", taken: "帳號已被使用", invalid: "資料不符合規定" } as const;

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const ip = clientIp((await headers()).get("x-forwarded-for"));
  // 每次送出都換一張驗證碼 被擋下的也一樣
  const captchaToken = await takeCaptchaToken("login");
  const gate = loginLimiter.check(ip);
  if (!gate.allowed) {
    auditMergedFailure(guest(ip), { module: "auth", action: "登入被擋下", target: "這個 IP 錯太多次" });
    return { error: tooManyAttempts(gate.retryAfterMs, "錯誤") };
  }

  const username = formText(formData, "username");
  let user: Awaited<ReturnType<typeof authenticate>>;
  try {
    // 驗證碼先於密碼檢查 答錯時還沒查帳號 不算帳號的失敗次數
    // 也看不出帳號是否存在 只算這個 IP 一次失敗
    if (!(await verifyCaptcha("login", formText(formData, CAPTCHA_FIELD), captchaToken))) {
      loginLimiter.recordFailure(ip);
      return { error: CAPTCHA_ERROR, username };
    }
    user = await authenticate(username, formText(formData, "password"));
  } catch (error) {
    // 資料庫錯誤的 message 可能帶連線字串 log 只記錯誤種類
    logError("auth", "登入時發生錯誤", error);
    return { error: "暫時無法登入，請稍後再試", username };
  }

  if (!user) {
    loginLimiter.recordFailure(ip);
    auditLoginFailure(guest(ip), normalizeUsername(username));
    // 拖慢單一連線的連續猜測
    await new Promise((resolve) => setTimeout(resolve, FAILURE_DELAY_MS));
    // 帳號不存在 密碼錯誤 鎖定中都用同一句 不透露帳號是否存在
    return { error: INVALID_CREDENTIALS, username };
  }

  loginLimiter.reset(ip);
  // 密碼正確才會走到這裡 說明已停用不會讓沒密碼的人知道帳號存在
  const actor = { id: user.id, name: normalizeUsername(username), ip };
  if (user.disabled) {
    audit(actor, { module: "auth", action: "登入失敗", outcome: "failure", detail: "帳號已停用" });
    return { error: "這個帳號已停用，請聯絡站長", username };
  }
  await createSession(user.id, user.sessionVersion);
  audit(actor, { module: "auth", action: "登入成功" });
  redirect(safeNextPath(formText(formData, "next")));
}

/** 只能用有效的邀請註冊 次數依 IP 雜湊存在資料庫 serverless 的記憶體不共用 */
export async function registerAction(_prev: RegisterState, formData: FormData): Promise<RegisterState> {
  const username = formText(formData, "username");
  // 每次送出都換一張驗證碼 被擋下的也一樣
  const captchaToken = await takeCaptchaToken("register");
  let result: RegisterResult;
  const ip = clientIp((await headers()).get("x-forwarded-for"));
  try {
    const now = new Date();
    const key = clientKey(ip);
    // 成功失敗都算一次 機器人填了蜜罐也照樣用掉次數
    const gate = await recordAttempt(REGISTER_ATTEMPTS, key, now);
    if (!gate.allowed) return { error: tooManyAttempts(gate.retryAfterMs) };
    // 回一般的訊息 不告訴機器人是哪裡露餡
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
    // 資料庫錯誤的 message 可能夾帶帳號與雜湊 log 只記錯誤種類
    logError("auth", "註冊時發生錯誤", error);
    return { error: "暫時無法註冊，請稍後再試", username };
  }

  if (!result.ok) {
    auditMergedFailure(guest(ip), { module: "auth", action: "註冊失敗", target: REGISTER_FAILURES[result.reason] });
    return { error: result.error, username };
  }
  updateTags(authTags.users, authTags.invites);
  await createSession(result.id, result.sessionVersion);
  audit({ id: result.id, name: normalizeUsername(username), ip }, { module: "auth", action: "註冊帳號" }, { module: "auth", action: "使用邀請連結", detail: result.deniedModules.length > 0 ? `不開放：${result.deniedModules.join("、")}` : "全部功能" });
  redirect("/");
}

export async function logout(): Promise<void> {
  // 讀不到是誰也要登出得掉
  const actor = await auditActor().catch(() => null);
  await deleteSession();
  if (actor?.id) audit(actor, { module: "auth", action: "登出" });
  redirect("/login");
}

/** 要再輸入密碼 次數限制跟改密碼共用 最後一個站長由 deleteOwnAccount 擋下 */
export async function deleteAccountAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireSession();
  const gate = passwordLimiter.check(session.id);
  if (!gate.allowed) return { error: tooManyAttempts(gate.retryAfterMs, "錯誤") };

  const state = await runAction({ module: "auth", action: "刪除帳號" }, async () => {
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

/** 只能改自己 使用者 id 來自 session 不看表單 */
export async function updateNicknameAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireSession();
  return runAction({ module: "auth", action: "更新暱稱" }, async () => {
    const result = await updateNickname(session.id, formText(formData, "nickname"));
    if (!result.ok) return { error: result.error };
    // 管理頁的使用者清單與模組權限表格都顯示暱稱
    updateTags(authTags.users);
    return result.nickname ? `已更新暱稱：${result.nickname}` : "已清除暱稱";
  });
}

/** 只能改自己 使用者 id 來自 session 不看表單 */
export async function updateAvatarAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireSession();
  return runAction({ module: "auth", action: "更換頭像" }, async () => {
    const result = await updateAvatar(session.id, formText(formData, "avatar"));
    if (!result.ok) return { error: result.error };
    // 管理頁的使用者清單與旅遊的同行的人都畫頭像
    updateTags(authTags.users);
    if (result.avatar === KEEP_AVATAR) return "頭像沒有變更";
    return result.avatar ? "已更換頭像" : "已改回文字頭像";
  });
}

/** 檔案已經在瀏覽器縮成小圖 內容由 service 再檢查一次 */
export async function uploadAvatarAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireSession();
  return runAction({ module: "auth", action: "上傳頭像" }, async () => {
    const photo = formData.get("photo");
    if (!(photo instanceof File)) return { error: "請選擇照片" };
    const result = await saveUploadedAvatar(session.id, Buffer.from(await photo.arrayBuffer()));
    if (!result.ok) return { error: result.error };
    updateTags(authTags.users);
    return "已更換頭像";
  });
}

export async function changePasswordAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireSession();
  const newPassword = formText(formData, "newPassword");
  if (newPassword !== formText(formData, "confirmPassword")) return { error: "兩次輸入的新密碼不一樣" };

  const gate = passwordLimiter.check(session.id);
  if (!gate.allowed) return { error: tooManyAttempts(gate.retryAfterMs, "錯誤") };

  // 密碼錯誤與不合規則會用結果回傳 丟出來的都是預期外的錯誤
  return runAction({ module: "auth", action: "變更密碼" }, async () => {
    const result = await changePassword(session.id, formText(formData, "currentPassword"), newPassword);
    if (!result.ok) {
      if (result.reason === "wrong_password") passwordLimiter.recordFailure(session.id);
      return { error: result.error };
    }
    passwordLimiter.reset(session.id);
    // 版本已遞增 其他裝置的 cookie 失效 這台換發新的 cookie 繼續登入
    await createSession(session.id, result.sessionVersion);
    await removeOtherSubscriptions(session.id, formText(formData, "pushEndpoint") || null);
    return "已變更密碼。這台裝置保持登入，其他裝置都已登出。";
  });
}
