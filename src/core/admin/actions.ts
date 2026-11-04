"use server";

import { refresh } from "next/cache";
import { headers } from "next/headers";
import { runAction } from "../action";
import { audit, auditActor } from "../audit";
import { requireOwner } from "../auth";
import { authTags } from "../auth/cache-tags";
import { createInvite, revokeInvite } from "../auth/invites";
import { INVITE_DAY_OPTIONS, INVITE_USE_OPTIONS } from "../auth/invite-rules";
import { updateTags } from "../cache";
import { INVALID_FORM_MESSAGE, actionErrorMessage, formFlag, formId, formText, formUuid } from "../form";
import { MODULE_ID_PATTERN } from "../ids";
import type { FormState } from "../ui/form-message";
import { deleteUser, setModuleAccess, setUserDisabled, unlockUser, usernameOf } from "./service";

/** 資料庫只存雜湊 link 只在建立當下的回應裡 重新整理就拿不回來 */
export type InviteFormState = FormState & { link?: string };

const USER_GONE = "找不到這個帳號，可能已經被刪除";

/** Server Action 可以被直接 POST 不能相信下拉選單 值要剛好是其中一個選項 */
function optionOf(options: readonly number[], raw: string): number | null {
  const value = Number(raw);
  return raw !== "" && options.includes(value) ? value : null;
}

/** Next 已確認 Origin 跟 Host 相同 站長在哪個網址建立邀請就給哪個網址 */
async function siteOrigin(): Promise<string> {
  const request = await headers();
  const origin = request.get("origin");
  if (origin) return origin;
  return `${request.get("x-forwarded-proto") ?? "https"}://${request.get("x-forwarded-host") ?? request.get("host")}`;
}

export async function createInviteAction(_prev: InviteFormState, formData: FormData): Promise<InviteFormState> {
  const owner = await requireOwner();
  const days = optionOf(INVITE_DAY_OPTIONS, formText(formData, "days"));
  const maxUses = optionOf(INVITE_USE_OPTIONS, formText(formData, "uses"));
  if (days === null || maxUses === null) return { error: INVALID_FORM_MESSAGE };
  // core 不能 import 模組清單 清單由表單帶回來 這裡只檢查格式 只有站長送得到這裡
  const allModules = formData.getAll("allModules").map(String).filter((id) => MODULE_ID_PATTERN.test(id));
  const allowed = new Set(formData.getAll("modules").map(String));
  if (!allModules.some((id) => allowed.has(id))) return { error: "至少選一個要開放的功能" };
  const deniedModules = allModules.filter((id) => !allowed.has(id));

  // 回傳多了 link 所以不套 runAction log 一樣只記錯誤種類 不印邀請碼
  try {
    const { token } = await createInvite({ createdBy: owner.id, days, maxUses, note: formText(formData, "note"), deniedModules });
    updateTags(authTags.invites);
    audit(await auditActor(), { module: "admin", action: "建立邀請連結", detail: `${days} 天 ${maxUses} 次，不開放：${deniedModules.join("、") || "無"}` });
    return {
      message: `已建立邀請連結：${days} 天內可以註冊 ${maxUses} 個帳號。`,
      link: `${await siteOrigin()}/register?code=${token}`,
    };
  } catch (error) {
    return { error: actionErrorMessage({ module: "admin", action: "建立邀請連結" }, error) };
  }
}

export async function revokeInviteAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireOwner();
  const id = formId(formData, "inviteId");
  if (id === null) return { error: INVALID_FORM_MESSAGE };
  return runAction({ module: "admin", action: "撤銷邀請", target: `邀請 #${id}` }, async () => {
    if (await revokeInvite(id)) {
      updateTags(authTags.invites);
      return;
    }
    // 沒有寫入就不會失效快取 但那一列要重新算繪畫面才會更新
    refresh();
    return { error: "這個邀請已經撤銷或不存在" };
  });
}

export async function setUserDisabledAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const owner = await requireOwner();
  const userId = formUuid(formData, "userId");
  const disabled = formFlag(formData, "disabled");
  if (userId === null || disabled === null) return { error: INVALID_FORM_MESSAGE };
  return runAction({ module: "admin", action: disabled ? "停用帳號" : "恢復帳號", target: await usernameOf(userId) }, async () => {
    if (await setUserDisabled(owner.id, userId, disabled)) {
      updateTags(authTags.users);
      return;
    }
    refresh();
    return { error: USER_GONE };
  });
}

export async function deleteUserAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const owner = await requireOwner();
  const userId = formUuid(formData, "userId");
  if (userId === null) return { error: INVALID_FORM_MESSAGE };
  return runAction({ module: "admin", action: "刪除帳號", target: await usernameOf(userId) }, async () => {
    if (await deleteUser(owner.id, userId)) {
      // 他建立的邀請跟著外鍵刪掉 所以邀請也要失效
      updateTags(authTags.users, authTags.invites);
      return;
    }
    refresh();
    return { error: USER_GONE };
  });
}

export async function unlockUserAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireOwner();
  const userId = formUuid(formData, "userId");
  if (userId === null) return { error: INVALID_FORM_MESSAGE };
  return runAction({ module: "admin", action: "解除鎖定", target: await usernameOf(userId) }, async () => {
    if (await unlockUser(userId)) {
      updateTags(authTags.users);
      return;
    }
    refresh();
    return { error: USER_GONE };
  });
}

export async function setModuleAccessAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireOwner();
  const userId = formUuid(formData, "userId");
  const moduleId = formText(formData, "moduleId");
  const allowed = formFlag(formData, "allowed");
  // core 不能 import 模組清單 這裡只檢查格式 寫錯的 id 也不會對應到任何模組
  if (userId === null || !MODULE_ID_PATTERN.test(moduleId) || allowed === null) return { error: INVALID_FORM_MESSAGE };
  return runAction({ module: "admin", action: allowed ? "開放模組" : "關閉模組", target: await usernameOf(userId), detail: moduleId }, async () => {
    const found = await setModuleAccess(userId, moduleId, allowed);
    // 權限每次都讀最新 沒有快取可以失效 只要重新算繪表格
    refresh();
    return found ? undefined : { error: USER_GONE };
  });
}
