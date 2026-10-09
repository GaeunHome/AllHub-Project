"use server";

import { requireSession } from "@/core/auth";
import { updateTags } from "@/core/cache";
import { INVALID_FORM_MESSAGE, formId, formText, runAction } from "@/core/form";
import type { FormState } from "@/core/ui/form-message";
import { parseNotifyToggle } from "@/core/ui/notify-toggle-form";
import { TwitchApiError } from "../lib/api";
import { twitchTags } from "../service/cache-tags";
import { TwitchUserError, addStreamer, removeStreamer, setStreamerNotify, syncSubscriptionsFor } from "../service/streamers";

export type { FormState } from "@/core/ui/form-message";

// Twitch 回的錯誤（找不到帳號、設定不對）直接給使用者看，其他錯誤只給摘要
const isUserError = (error: unknown) => error instanceof TwitchUserError || error instanceof TwitchApiError;
const run = (action: string, work: () => Promise<FormState | string | void>) => runAction({ module: "twitch", action }, isUserError, work);

// 寫入橫跨資料庫與 Twitch API，失敗時可能只完成一部分，所以在 finally 讓 tag 失效
// 一律用登入者的 id 呼叫 service：表單送來的主播 id 只決定操作哪一位，只會動到自己的追蹤

export async function addStreamerAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { id: userId } = await requireSession();
  try {
    return await run("加入主播", async () => `已加入 ${(await addStreamer(userId, formText(formData, "login"))).displayName}`);
  } finally {
    // 第一次有人追蹤時也會新增主播
    updateTags(twitchTags.follows, twitchTags.streamers);
  }
}

export async function removeStreamerAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { id: userId } = await requireSession();
  const id = formId(formData, "id");
  if (id === null) return { error: INVALID_FORM_MESSAGE };
  try {
    return await run("刪除主播", async () => {
      const { warning } = await removeStreamer(userId, id);
      return warning ? { message: warning } : {};
    });
  } finally {
    // 最後一位追蹤者取消時也會刪除主播
    updateTags(twitchTags.follows, twitchTags.streamers);
  }
}

export async function syncAction(): Promise<FormState> {
  const { id: userId } = await requireSession();
  try {
    return await run("同步訂閱", () => syncSubscriptionsFor(userId));
  } finally {
    updateTags(twitchTags.streamers);
  }
}

/** 每位主播各自的通知開關，記在自己的追蹤上；關掉時開台照樣記錄，只是不通知自己 */
export async function setStreamerNotifyAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { id: userId } = await requireSession();
  const toggle = parseNotifyToggle(formData);
  if (!toggle) return { error: INVALID_FORM_MESSAGE };
  try {
    return await run("變更通知設定", async () => ((await setStreamerNotify(userId, toggle.id, toggle.enabled)) ? {} : { error: "找不到這位主播，請重新整理頁面" }));
  } finally {
    updateTags(twitchTags.follows);
  }
}
