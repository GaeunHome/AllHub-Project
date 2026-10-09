"use server";

import { refresh } from "next/cache";
import { headers } from "next/headers";
import { requireOwner } from "../auth";
import { authTags } from "../auth/cache-tags";
import { INVITE_DAY_OPTIONS, INVITE_USE_OPTIONS, InviteInputError, createInvite, revokeInvite } from "../auth/invites";
import { updateTags } from "../cache";
import { INVALID_FORM_MESSAGE, actionErrorMessage, formFlag, formId, formText, formUuid, runAction } from "../form";
import type { FormState } from "../ui/form-message";
import { AdminUserError, deleteUser, setUserDisabled, unlockUser } from "./service";

/** link 只出現在建立當下的回應裡；資料庫只存雜湊，重新整理後就拿不回來 */
export type InviteFormState = FormState & { link?: string };

const USER_GONE = "找不到這個帳號，可能已經被刪除";
const isAdminError = (error: unknown) => error instanceof AdminUserError;

/** 表單送來的字串要剛好是其中一個選項；Server Action 可以被直接 POST，不能相信下拉選單 */
function optionOf(options: readonly number[], raw: string): number | null {
  const value = Number(raw);
  return raw !== "" && options.includes(value) ? value : null;
}

/** Server Action 的 Origin 已經被 Next 比對過跟 Host 相同；站長在哪個網址建立邀請就給哪個網址 */
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

  // 回傳的形狀多了 link，不套 runAction，錯誤一樣交給 actionErrorMessage（log 只記錯誤種類，不會印出邀請碼）
  try {
    const { token } = await createInvite({ createdBy: owner.id, days, maxUses, note: formText(formData, "note") });
    updateTags(authTags.invites);
    return {
      message: `已建立邀請連結：${days} 天內可以註冊 ${maxUses} 個帳號。連結只會顯示這一次，請現在複製。`,
      link: `${await siteOrigin()}/register?code=${token}`,
    };
  } catch (error) {
    return { error: actionErrorMessage({ module: "admin", action: "建立邀請連結" }, (e) => e instanceof InviteInputError, error) };
  }
}

export async function revokeInviteAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireOwner();
  const id = formId(formData, "inviteId");
  if (id === null) return { error: INVALID_FORM_MESSAGE };
  return runAction({ module: "admin", action: "撤銷邀請" }, () => false, async () => {
    if (await revokeInvite(id)) {
      updateTags(authTags.invites);
      return;
    }
    // 已經撤銷或不存在時沒有寫入、不失效快取，但畫面上那一列要重新算繪才會更新
    refresh();
    return { error: "這個邀請已經撤銷或不存在" };
  });
}

export async function setUserDisabledAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const owner = await requireOwner();
  const userId = formUuid(formData, "userId");
  const disabled = formFlag(formData, "disabled");
  if (userId === null || disabled === null) return { error: INVALID_FORM_MESSAGE };
  return runAction({ module: "admin", action: disabled ? "停用帳號" : "恢復帳號" }, isAdminError, async () => {
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
  return runAction({ module: "admin", action: "刪除帳號" }, isAdminError, async () => {
    if (await deleteUser(owner.id, userId)) {
      // 他建立的邀請也跟著外鍵刪掉
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
  return runAction({ module: "admin", action: "解除鎖定" }, () => false, async () => {
    if (await unlockUser(userId)) {
      updateTags(authTags.users);
      return;
    }
    refresh();
    return { error: USER_GONE };
  });
}
