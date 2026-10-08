"use server";

import { requireSession } from "@/core/auth";
import { updateTags } from "@/core/cache";
import { INVALID_FORM_MESSAGE, formId, formText, runAction } from "@/core/form";
import type { FormState } from "@/core/ui/form-message";
import * as service from "../service/accounts";
import { starrailTags } from "../service/cache-tags";

export type { FormState } from "@/core/ui/form-message";

const done = (result: service.ActionResult): FormState => (result.ok ? { message: result.message } : { error: result.error });
// 輸入錯誤與 HoYoLAB 的錯誤由 service 用結果回傳，丟出來的都是預期外的錯誤
const run = (action: string, work: () => Promise<FormState | string | void>) => runAction({ module: "starrail", action }, () => false, work);

// 連結與簽到要逐個角色寫入、也會打 HoYoLAB，失敗時可能只完成一部分，所以在 finally 讓 tag 失效

export async function linkAccountAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireSession();
  const cookie = formText(formData, "cookie").trim();
  if (!cookie) return { error: "請貼上 cookie" };
  try {
    return await run("連結帳號", async () => done(await service.linkAccount(cookie)));
  } finally {
    updateTags(starrailTags.accounts);
  }
}

export async function checkinAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireSession();
  const id = formId(formData, "accountId");
  if (id === null) return { error: INVALID_FORM_MESSAGE };
  try {
    return await run("簽到", async () => done(await service.checkinAccount(id)));
  } finally {
    // 失敗也會寫一筆紀錄，也可能把 cookie 標成失效
    updateTags(starrailTags.checkins, starrailTags.accounts);
  }
}

export async function setThresholdAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireSession();
  const raw = formText(formData, "threshold").trim();
  const threshold = raw === "" ? null : Number(raw);
  if (threshold !== null && (!Number.isInteger(threshold) || threshold < 0 || threshold > 1000)) {
    return { error: "門檻要是 0–1000 的整數，留空表示用預設值" };
  }
  const id = formId(formData, "accountId");
  if (id === null) return { error: INVALID_FORM_MESSAGE };
  try {
    return await run("設定提醒門檻", async () => {
      await service.setStaminaThreshold(id, threshold);
      return threshold === null ? "已改回預設門檻" : `門檻已設為 ${threshold}`;
    });
  } finally {
    updateTags(starrailTags.accounts);
  }
}

export async function removeAccountAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireSession();
  const id = formId(formData, "accountId");
  if (id === null) return { error: INVALID_FORM_MESSAGE };
  try {
    return await run("移除角色", () => service.removeAccount(id));
  } finally {
    // 簽到紀錄會跟著角色一起刪除
    updateTags(starrailTags.accounts, starrailTags.checkins);
  }
}
