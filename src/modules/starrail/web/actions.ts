"use server";

import { requireSession } from "@/core/auth";
import { updateTags } from "@/core/cache";
import { INVALID_FORM_MESSAGE, formId, formText, runAction } from "@/core/form";
import type { FormState } from "@/core/ui/form-message";
import * as service from "../service/accounts";
import { starrailTags } from "../service/cache-tags";

export type { FormState } from "@/core/ui/form-message";
/** 連結帳號的表單：好幾個伺服器都有角色時，第一步回傳清單讓使用者選 */
export type LinkState = FormState & { roles?: service.RoleChoice[] };

const done = (result: service.ActionResult): FormState => (result.ok ? { message: result.message } : { error: result.error });
// 輸入錯誤與 HoYoLAB 的錯誤由 service 用結果回傳，丟出來的都是預期外的錯誤
const run = (action: string, work: () => Promise<FormState | string | void>) => runAction({ module: "starrail", action }, () => false, work);

// 連結與簽到要逐個角色寫入、也會打 HoYoLAB，失敗時可能只完成一部分，所以在 finally 讓 tag 失效
// 一律用登入者的 id 呼叫 service：表單送來的帳號 id 只決定操作哪一個，別人的會被當作不存在

export async function linkAccountAction(_prev: LinkState, formData: FormData): Promise<LinkState> {
  const { id: userId } = await requireSession();
  const cookie = formText(formData, "cookie").trim();
  if (!cookie) return { error: "請貼上 cookie" };
  // 第二步帶著勾選的 UID 再送一次 cookie（cookie 只留在瀏覽器的表單裡，伺服器不存）
  const selection: service.RoleSelection = formData.get("step") === "choose" ? formData.getAll("uid").map(String) : "ask";
  let roles: service.RoleChoice[] | undefined;
  try {
    const state = await run("連結帳號", async () => {
      const result = await service.linkAccount(userId, cookie, selection);
      if ("roles" in result) {
        roles = result.roles;
        return;
      }
      return done(result);
    });
    return roles ? { roles } : state;
  } finally {
    // 選伺服器的步驟還沒寫入，不必讓快取失效
    if (!roles) updateTags(starrailTags.accounts);
  }
}

export async function checkinAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { id: userId } = await requireSession();
  const id = formId(formData, "accountId");
  if (id === null) return { error: INVALID_FORM_MESSAGE };
  try {
    return await run("簽到", async () => done(await service.checkinAccount(userId, id)));
  } finally {
    // 失敗也會寫一筆紀錄，也可能把 cookie 標成失效
    updateTags(starrailTags.checkins, starrailTags.accounts);
  }
}

export async function setThresholdAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { id: userId } = await requireSession();
  const raw = formText(formData, "threshold").trim();
  const threshold = raw === "" ? null : Number(raw);
  if (threshold !== null && (!Number.isInteger(threshold) || threshold < 0 || threshold > 1000)) {
    return { error: "門檻要是 0–1000 的整數，留空表示用預設值" };
  }
  const id = formId(formData, "accountId");
  if (id === null) return { error: INVALID_FORM_MESSAGE };
  try {
    return await run("設定提醒門檻", async () => {
      if (!(await service.setStaminaThreshold(userId, id, threshold))) return { error: "找不到這個帳號，請重新整理頁面" };
      return threshold === null ? "已改回預設門檻" : `門檻已設為 ${threshold}`;
    });
  } finally {
    updateTags(starrailTags.accounts);
  }
}

export async function redeemCodeAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { id: userId } = await requireSession();
  const id = formId(formData, "accountId");
  if (id === null) return { error: INVALID_FORM_MESSAGE };
  let cookieFlagChanged = false;
  try {
    return await run("兌換", async () => {
      const result = await service.redeemCodeFor(userId, id, formText(formData, "code"));
      cookieFlagChanged = result.cookieFlagChanged;
      return result.ok ? { message: result.message } : { error: result.error };
    });
  } finally {
    // 兌換本身不寫資料庫；只有寫了 cookie 失效標記時才讓帳號的快取失效
    if (cookieFlagChanged) updateTags(starrailTags.accounts);
  }
}

export async function removeAccountAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { id: userId } = await requireSession();
  const id = formId(formData, "accountId");
  if (id === null) return { error: INVALID_FORM_MESSAGE };
  try {
    return await run("移除角色", () => service.removeAccount(userId, id));
  } finally {
    // 簽到紀錄會跟著角色一起刪除
    updateTags(starrailTags.accounts, starrailTags.checkins);
  }
}
