"use server";

import { requireSession } from "@/core/auth";
import { updateTags } from "@/core/cache";
import { INVALID_FORM_MESSAGE, formId, formText, runAction } from "@/core/form";
import type { FormState } from "@/core/ui/form-message";
import { parseNotifyToggle } from "@/core/ui/notify-toggle-form";
import { TwitchApiError } from "../lib/api";
import { twitchTags } from "../service/cache-tags";
import { TwitchUserError, addStreamer, removeStreamer, setStreamerNotify, syncSubscriptions } from "../service/streamers";

export type { FormState } from "@/core/ui/form-message";

// Twitch 回的錯誤（找不到帳號、設定不對）直接給使用者看，其他錯誤只給摘要
const isUserError = (error: unknown) => error instanceof TwitchUserError || error instanceof TwitchApiError;
const run = (action: string, work: () => Promise<FormState | string | void>) => runAction({ module: "twitch", action }, isUserError, work);

// 寫入橫跨資料庫與 Twitch API，失敗時可能只完成一部分，所以在 finally 讓 tag 失效

export async function addStreamerAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireSession();
  try {
    return await run("加入主播", async () => `已加入 ${(await addStreamer(formText(formData, "login"))).displayName}`);
  } finally {
    updateTags(twitchTags.streamers);
  }
}

export async function removeStreamerAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireSession();
  const id = formId(formData, "id");
  if (id === null) return { error: INVALID_FORM_MESSAGE };
  try {
    return await run("刪除主播", async () => {
      const { warning } = await removeStreamer(id);
      return warning ? { message: warning } : {};
    });
  } finally {
    updateTags(twitchTags.streamers);
  }
}

export async function syncAction(): Promise<FormState> {
  await requireSession();
  try {
    return await run("同步訂閱", () => syncSubscriptions());
  } finally {
    updateTags(twitchTags.streamers);
  }
}

/** 每位主播各自的通知開關；關掉時開台照樣記錄，只是不建立網站通知 */
export async function setStreamerNotifyAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireSession();
  const toggle = parseNotifyToggle(formData);
  if (!toggle) return { error: INVALID_FORM_MESSAGE };
  try {
    return await run("變更通知設定", async () => ((await setStreamerNotify(toggle.id, toggle.enabled)) ? {} : { error: "找不到這位主播，請重新整理頁面" }));
  } finally {
    updateTags(twitchTags.streamers);
  }
}
