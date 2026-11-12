"use server";

import { requireModule } from "@/core/auth";
import { updateTags } from "@/core/cache";
import { externalAssetUrl } from "@/core/external-url";
import { runAction } from "@/core/action";
import { INVALID_FORM_MESSAGE, formFlag, formId, formText } from "@/core/form";
import type { FormState } from "@/core/ui/form-message";
import { GEETEST_SCRIPT } from "../lib/geetest";
import type { CaptchaChallenge } from "../lib/passport";
import { removeAccount, setAutoRedeem, setGameReminders, setStaminaThreshold, type Outcome } from "../service/accounts";
import { starrailTags } from "../service/cache-tags";
import { checkinAccount } from "../service/checkin";
import { linkAccount, type RoleChoice, type RoleSelection } from "../service/link";
import { loginAccount, type LoginFields } from "../service/login";
import { redeemCodeFor } from "../service/redeem";

/**
 * 好幾個伺服器都有角色時 第一步回傳清單讓使用者選
 * 連結好了帶著剛連結的帳號 id 讓畫面導向它 還有要提醒的事
 */
export type LinkState = FormState & { roles?: RoleChoice[]; warning?: string; accountId?: number };

const done = (result: Outcome<{ message: string }>): FormState => (result.ok ? { message: result.message } : { error: result.error });
// 輸入與 HoYoLAB 的錯誤由 service 用結果回傳 丟出來的都是預期外的錯誤
const run = (action: string, work: () => Promise<FormState | string | void>) => runAction({ module: "starrail", action }, work);
// 簽到 門檻 兌換的提示視窗標題已經寫了失敗 預期外的錯誤只寫原因不明
const runTitled = (action: string, work: () => Promise<FormState | string | void>) => runAction({ module: "starrail", action, titled: true }, work);

// 逐個角色寫入 可能只完成一部分 所以在 finally 讓 tag 失效
// 表單送來的帳號 id 只決定操作哪一個

export async function linkAccountAction(_prev: LinkState, formData: FormData): Promise<LinkState> {
  const { id: userId } = await requireModule("starrail");
  const cookie = formText(formData, "cookie").trim();
  if (!cookie) return { error: "請貼上 cookie" };
  // cookie 只留在瀏覽器的表單裡 第二步跟勾選的 UID 一起再送一次
  const selection: RoleSelection = formData.get("step") === "choose" ? formData.getAll("uid").map(String) : "ask";
  let roles: RoleChoice[] | undefined;
  // 帳號 id 來自 service 剛寫入的自己那一列 不是表單送來的
  let linked: Pick<LinkState, "warning" | "accountId"> | undefined;
  try {
    const state = await run("連結帳號", async () => {
      const result = await linkAccount(userId, cookie, selection);
      if ("roles" in result) {
        roles = result.roles;
        return;
      }
      if (!result.ok) return { error: result.error };
      linked = { accountId: result.accountId, ...(result.warning ? { warning: result.warning } : {}) };
      return result.message;
    });
    return roles ? { roles } : { ...state, ...linked };
  } finally {
    // 選伺服器的步驟還沒寫入 不用讓快取失效
    if (!roles) updateTags(starrailTags.accounts);
  }
}

/**
 * 帳號密碼登入的下一步 captcha 是要解 Geetest verify 是要填 email 驗證碼
 * 好幾個伺服器都有角色時 cookie 跟清單一起回到瀏覽器 跟貼上的一樣用 linkAccountAction 選
 */
export type LoginState = LinkState & { captcha?: GeetestChallenge; verify?: string; cookie?: string };

/** script 是 Geetest 的程式 開發時改寫到假伺服器 */
export type GeetestChallenge = CaptchaChallenge & { script: string };

const optional = (formData: FormData, name: string) => {
  const value = formText(formData, name).trim();
  return value === "" ? {} : { [name]: value };
};

/** 帳號密碼只轉給 service 操作紀錄只寫動作名稱 */
export async function loginAccountAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const { id: userId } = await requireModule("starrail");
  const fields: LoginFields = {
    account: formText(formData, "account"),
    password: formText(formData, "password"),
    deviceId: formText(formData, "deviceId"),
    ...optional(formData, "aigis"),
    ...optional(formData, "verify"),
    ...optional(formData, "code"),
  };
  let next: LoginState | undefined;
  let linked: Pick<LinkState, "warning" | "accountId"> | undefined;
  // service 回了下一步或錯誤就是沒寫入 預期外的錯誤不知道寫了沒有
  let untouched = false;
  try {
    const state = await run("用帳號密碼連結帳號", async () => {
      const result = await loginAccount(userId, fields);
      if ("step" in result) {
        untouched = true;
        if (result.step === "captcha") next = { captcha: { ...result.captcha, script: externalAssetUrl(GEETEST_SCRIPT) ?? GEETEST_SCRIPT } };
        else if (result.step === "email") next = { verify: result.verify };
        else next = { roles: result.roles, cookie: result.cookie };
        return;
      }
      if (!result.ok) {
        untouched = true;
        return { error: result.error };
      }
      linked = { accountId: result.accountId, ...(result.warning ? { warning: result.warning } : {}) };
      return result.message;
    });
    return next ?? { ...state, ...linked };
  } finally {
    if (!untouched) updateTags(starrailTags.accounts);
  }
}

export async function checkinAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { id: userId } = await requireModule("starrail");
  const id = formId(formData, "accountId");
  if (id === null) return { error: INVALID_FORM_MESSAGE };
  // 預期外的錯誤時不知道改了沒有 當作改了
  let accountChanged = true;
  try {
    return await runTitled("簽到", async () => {
      const result = await checkinAccount(userId, id);
      accountChanged = result.accountChanged;
      return done(result);
    });
  } finally {
    // 失敗也會寫一筆紀錄 帳號的快取標著所有 HoYoLAB 的資料 只在 cookie 失效標記改了時失效
    updateTags(starrailTags.checkins, ...(accountChanged ? [starrailTags.accounts] : []));
  }
}

export async function setThresholdAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { id: userId } = await requireModule("starrail");
  const raw = formText(formData, "threshold").trim();
  const threshold = raw === "" ? null : Number(raw);
  if (threshold !== null && (!Number.isInteger(threshold) || threshold < 0 || threshold > 1000)) {
    return { error: "門檻要是 0–1000 的整數，留空表示用預設值" };
  }
  const id = formId(formData, "accountId");
  if (id === null) return { error: INVALID_FORM_MESSAGE };
  try {
    return await runTitled("設定提醒門檻", async () => {
      if (!(await setStaminaThreshold(userId, id, threshold))) return { error: "找不到這個帳號，請重新整理頁面" };
      return threshold === null ? "已改回預設門檻" : `門檻已設為 ${threshold}`;
    });
  } finally {
    updateTags(starrailTags.accounts);
  }
}

/** 打開時 service 會先確認 cookie 有兌換要用的鍵 單一指令 成功後才讓帳號的快取失效 */
export async function setAutoRedeemAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { id: userId } = await requireModule("starrail");
  const id = formId(formData, "accountId");
  const enabled = formFlag(formData, "enabled");
  if (id === null || enabled === null) return { error: INVALID_FORM_MESSAGE };
  return run("設定自動兌換", async () => {
    const result = await setAutoRedeem(userId, id, enabled);
    if (!result.ok) return { error: result.error };
    updateTags(starrailTags.accounts);
    return enabled ? "已打開自動兌換" : "已關閉自動兌換";
  });
}

/** 每日實訓 每週內容與終局挑戰的提醒 單一指令 成功後才讓帳號的快取失效 */
export async function setGameRemindersAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { id: userId } = await requireModule("starrail");
  const id = formId(formData, "accountId");
  const enabled = formFlag(formData, "enabled");
  if (id === null || enabled === null) return { error: INVALID_FORM_MESSAGE };
  return run("設定提醒", async () => {
    if (!(await setGameReminders(userId, id, enabled))) return { error: "找不到這個帳號，請重新整理頁面" };
    updateTags(starrailTags.accounts);
    return enabled ? "已打開每日、每週與終局提醒" : "已關閉每日、每週與終局提醒";
  });
}

// 兌換不寫資料庫 cookie 失效標記也不動 所以不用讓快取失效
export async function redeemCodeAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { id: userId } = await requireModule("starrail");
  const id = formId(formData, "accountId");
  if (id === null) return { error: INVALID_FORM_MESSAGE };
  return runTitled("兌換", async () => {
    return done(await redeemCodeFor(userId, id, formText(formData, "code")));
  });
}

export async function removeAccountAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { id: userId } = await requireModule("starrail");
  const id = formId(formData, "accountId");
  if (id === null) return { error: INVALID_FORM_MESSAGE };
  try {
    return await run("移除角色", () => removeAccount(userId, id));
  } finally {
    // 簽到紀錄會跟著角色一起刪除
    updateTags(starrailTags.accounts, starrailTags.checkins);
  }
}
