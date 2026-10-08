"use server";

import { redirect } from "next/navigation";
import { after } from "next/server";
import { requireSession } from "@/core/auth";
import { expireTags, updateTags, type CacheTag } from "@/core/cache";
import { INVALID_FORM_MESSAGE, actionErrorMessage, formId, formText, runAction } from "@/core/form";
import type { FormState } from "@/core/ui/form-message";
import { parseNotifyToggle } from "@/core/ui/notify-toggle-form";
import { parseVideoId } from "../lib/parse";
import { watchPagePath } from "../lib/urls";
import { AI_PROVIDER_IDS, isAiProvider } from "../lib/subtitles/providers";
import { youtubeTags } from "../service/cache-tags";
import { checkChineseCaptions } from "../service/caption-status";
import { YoutubeUserError, addChannel, removeChannel, renewSubscriptions, setChannelNotify } from "../service/channels";
import {
  ApiKeySetupError,
  TranslationUserError,
  continueTranslation,
  restartTranslation,
  retryTranslation,
  saveSettings,
  startTranslation,
  uploadSubtitles,
  type Progress,
  type StartResult,
} from "../service/translation";
import { readSubtitleFile } from "./upload";

export type { FormState } from "@/core/ui/form-message";

// 寫入可能橫跨資料庫與外部服務、分好幾步，失敗時可能只完成一部分，所以在 finally 讓 tag 失效

/** 清單上的翻譯狀態與那支影片的觀看頁；影片 id 不正確時 service 不會寫入 */
function translationTags(input: string): CacheTag[] {
  const videoId = parseVideoId(input);
  return videoId ? [youtubeTags.translations, youtubeTags.translation(videoId)] : [];
}

// 資料庫錯誤的 message 含 SQL 與參數（金鑰密文、整份字幕），畫面只給摘要、log 只記錯誤種類
const isUserError = (error: unknown) => error instanceof YoutubeUserError || error instanceof TranslationUserError;
const scope = (action: string) => ({ module: "youtube", action });
const run = (action: string, work: () => Promise<FormState | string | void>) => runAction(scope(action), isUserError, work);
const userMessage = (error: unknown, action: string) => actionErrorMessage(scope(action), isUserError, error);

export async function addChannelAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireSession();
  try {
    return await run("加入頻道", async () => `已加入 ${(await addChannel(formText(formData, "channel"))).title}`);
  } finally {
    updateTags(youtubeTags.channels);
  }
}

export async function removeChannelAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireSession();
  const id = formId(formData, "id");
  if (id === null) return { error: INVALID_FORM_MESSAGE };
  try {
    return await run("刪除頻道", async () => {
      const { warning } = await removeChannel(id);
      return warning ? { message: warning } : {};
    });
  } finally {
    updateTags(youtubeTags.channels);
  }
}

export async function renewAction(): Promise<FormState> {
  await requireSession();
  try {
    return await run("續訂", () => renewSubscriptions());
  } finally {
    updateTags(youtubeTags.channels);
  }
}

/** 每個頻道各自的通知開關；關掉時新影片照樣記錄，只是不建立網站通知 */
export async function setChannelNotifyAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireSession();
  const toggle = parseNotifyToggle(formData);
  if (!toggle) return { error: INVALID_FORM_MESSAGE };
  try {
    return await run("變更通知設定", async () => ((await setChannelNotify(toggle.id, toggle.enabled)) ? {} : { error: "找不到這個頻道，請重新整理頁面" }));
  } finally {
    updateTags(youtubeTags.channels);
  }
}

const RECHECK_MESSAGES = {
  yes: "有中文字幕了，可以直接在 YouTube 看",
  no: "還沒有中文字幕，可以用翻譯觀看",
  unknown: "無法確認是否有中文字幕（YouTube 可能擋下了請求），晚點再試",
} as const;

/** 影片清單上的「重新檢查」：很多頻道上片後才補字幕 */
export async function recheckCaptionsAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireSession();
  const raw = formText(formData, "videoId");
  const videoId = parseVideoId(raw);
  if (!videoId || videoId !== raw) return { error: INVALID_FORM_MESSAGE };
  try {
    return await run("重新檢查", async () => {
      const status = await checkChineseCaptions(videoId);
      return status ? { message: RECHECK_MESSAGES[status] } : { error: "找不到這支影片，請重新整理頁面" };
    });
  } finally {
    updateTags(youtubeTags.videos);
  }
}

export async function openVideoAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireSession();
  const videoId = parseVideoId(formText(formData, "url"));
  if (!videoId) return { error: "看不懂這個網址，請貼 YouTube 影片網址" };
  redirect(watchPagePath(videoId));
}

export async function saveSettingsAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireSession();
  const provider = formText(formData, "provider");
  if (!isAiProvider(provider)) return { error: "請選擇 AI 供應商" };

  const field = (name: string) => Object.fromEntries(AI_PROVIDER_IDS.map((p) => [p, formText(formData, `${name}_${p}`)]));
  try {
    return await run("儲存設定", async () => {
      await saveSettings({
        provider,
        keys: field("key"),
        clear: AI_PROVIDER_IDS.filter((p) => formData.get(`clear_${p}`) === "on"),
        models: field("model"),
        glossaryText: formText(formData, "glossary"),
      });
      return "已儲存";
    });
  } finally {
    updateTags(youtubeTags.settings);
  }
}

/** needsSettings：金鑰沒設定或解不開，畫面附上「翻譯設定」連結 */
export type StartState = StartResult | { ok: false; message: string; canUpload: false; needsSettings?: true };

const settingsFlag = (error: unknown) => (error instanceof ApiKeySetupError ? { needsSettings: true as const } : {});

export async function startTranslationAction(videoId: string): Promise<StartState> {
  await requireSession();
  try {
    return await startTranslation(videoId);
  } catch (error) {
    return { ok: false, message: userMessage(error, "開始翻譯"), canUpload: false, ...settingsFlag(error) };
  } finally {
    updateTags(...translationTags(videoId));
  }
}

export async function uploadSubtitlesAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireSession();
  const file = await readSubtitleFile(formData.get("file"));
  if ("error" in file) return { error: file.error };
  const videoId = formText(formData, "videoId");
  try {
    return await run("上傳字幕", async () => {
      await uploadSubtitles(videoId, file.text);
      return "已上傳，開始翻譯";
    });
  } finally {
    updateTags(...translationTags(videoId));
  }
}

export type ContinueActionError = { actionError: string; needsSettings?: true };

export async function continueTranslationAction(videoId: string, positionMs?: number): Promise<Progress | ContinueActionError> {
  await requireSession();
  // Server Action 可以被直接 POST，播放位置不是正常的毫秒數就當成沒有
  const position = typeof positionMs === "number" && Number.isFinite(positionMs) && positionMs >= 0 ? positionMs : undefined;
  try {
    return await continueTranslation(videoId, { positionMs: position });
  } catch (error) {
    return { actionError: userMessage(error, "翻譯"), ...settingsFlag(error) };
  } finally {
    // 每批寫回不能用 updateTag：會重繪頁面、翻譯面板重新掛載、回應還夾帶整份字幕；等回應送出後才讓快取失效
    const tags = translationTags(videoId);
    if (tags.length > 0) after(() => expireTags(...tags));
  }
}

export async function retryTranslationAction(videoId: string): Promise<FormState> {
  await requireSession();
  try {
    return await run("重試", () => retryTranslation(videoId));
  } finally {
    updateTags(...translationTags(videoId));
  }
}

export async function restartTranslationAction(videoId: string): Promise<FormState> {
  await requireSession();
  try {
    return await run("重新翻譯", () => restartTranslation(videoId));
  } finally {
    updateTags(...translationTags(videoId));
  }
}
