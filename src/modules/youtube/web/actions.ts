"use server";

import { redirect } from "next/navigation";
import { after } from "next/server";
import { requireSession } from "@/core/auth";
import { expireTags, updateTags, type CacheTag } from "@/core/cache";
import { logError } from "@/core/errors";
import { INVALID_FORM_MESSAGE, actionErrorMessage, formId, formText, runAction } from "@/core/form";
import type { FormState } from "@/core/ui/form-message";
import { parseNotifyToggle } from "@/core/ui/notify-toggle-form";
import { VIDEO_ID, parseVideoId } from "../lib/parse";
import { watchPagePath } from "../lib/urls";
import { AI_PROVIDER_IDS, isAiProvider } from "../lib/subtitles/providers";
import { saveSettings } from "../service/ai-settings";
import { youtubeTags } from "../service/cache-tags";
import { cachedVideoInfo } from "../service/cached";
import { checkFollowedVideoCaptions } from "../service/caption-status";
import { addChannel, removeChannel, renewSubscriptionsFor, setChannelNotify } from "../service/channels";
import { ApiKeySetupError } from "../service/errors";
import { SAVED_FULL_MESSAGE, keepVideo, removeSavedVideo, type VideoSnapshot } from "../service/saved-videos";
import { continueTranslation, restartTranslation, retryTranslation, startTranslation, uploadSubtitles, type Progress, type StartResult } from "../service/translation";
import { readSubtitleFile } from "./upload";

export type { FormState } from "@/core/ui/form-message";

// 寫入可能橫跨資料庫與外部服務 失敗時可能只做完一部分 所以在 finally 讓 tag 失效
// 一律用登入者呼叫 service 表單送來的 id 只決定操作哪一筆

/** 清單上的翻譯狀態與那支影片的觀看頁 影片 id 不對時 service 不會寫入 */
function translationTags(input: string): CacheTag[] {
  const videoId = parseVideoId(input);
  return videoId ? [youtubeTags.translations, youtubeTags.translation(videoId)] : [];
}

// 資料庫錯誤的 message 含 SQL 與金鑰密文這類參數 畫面只給摘要 log 只記種類
const scope = (action: string) => ({ module: "youtube", action });
const run = (action: string, work: () => Promise<FormState | string | void>) => runAction(scope(action), work);
const userMessage = (error: unknown, action: string) => actionErrorMessage(scope(action), error);

/** 表單送來的影片 id 只收 11 碼本身 不解析網址 */
function formVideoId(formData: FormData): string | null {
  const raw = formText(formData, "videoId");
  return VIDEO_ID.test(raw) ? raw : null;
}

/** 資料庫沒有的標題與頻道名稱沿用觀看頁讀過的 oEmbed 快取 不必再等一次外部請求 */
async function oembedSnapshot(videoId: string): Promise<VideoSnapshot | null> {
  const info = await cachedVideoInfo(videoId);
  return info && { title: info.title, channelTitle: info.channelName };
}

/** 按過翻譯的影片自動加進保留清單 只是附帶的 出錯或滿了都不影響翻譯 回傳有沒有寫入 */
async function keepTranslated(userId: string, input: string): Promise<boolean> {
  const videoId = parseVideoId(input);
  if (!videoId) return false;
  try {
    return (await keepVideo(userId, videoId, { pinned: false, lookup: () => oembedSnapshot(videoId) })) === "saved";
  } catch (error) {
    logError("youtube", "加入保留的影片失敗", error);
    return false;
  }
}

export async function addChannelAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { id: userId } = await requireSession();
  try {
    return await run("加入頻道", async () => `已加入 ${(await addChannel(userId, formText(formData, "channel"))).title}`);
  } finally {
    // 第一次有人追蹤時新增頻道 追蹤時也從 RSS 補進影片
    updateTags(youtubeTags.channels, youtubeTags.follows, youtubeTags.videos);
  }
}

export async function removeChannelAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { id: userId } = await requireSession();
  const id = formId(formData, "id");
  if (id === null) return { error: INVALID_FORM_MESSAGE };
  try {
    return await run("刪除頻道", async () => {
      const { warning } = await removeChannel(userId, id);
      return warning ? { message: warning } : {};
    });
  } finally {
    // 最後一位追蹤者取消時也會刪除頻道
    updateTags(youtubeTags.channels, youtubeTags.follows);
  }
}

export async function renewAction(): Promise<FormState> {
  const { id: userId } = await requireSession();
  try {
    return await run("續訂", () => renewSubscriptionsFor(userId));
  } finally {
    updateTags(youtubeTags.channels);
  }
}

/** 通知開關記在自己的追蹤上 關掉時新影片照樣記錄 只是不通知自己 */
export async function setChannelNotifyAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { id: userId } = await requireSession();
  const toggle = parseNotifyToggle(formData);
  if (!toggle) return { error: INVALID_FORM_MESSAGE };
  try {
    return await run("變更通知設定", async () => ((await setChannelNotify(userId, toggle.id, toggle.enabled)) ? {} : { error: "找不到這個頻道，請重新整理頁面" }));
  } finally {
    updateTags(youtubeTags.follows);
  }
}

const RECHECK_MESSAGES = {
  yes: "有中文字幕了，可以直接在 YouTube 看",
  no: "還沒有中文字幕，可以用翻譯觀看",
  unknown: "無法確認是否有中文字幕（YouTube 可能擋下了請求），晚點再試",
} as const;

/** 很多頻道上片後才補字幕 所以清單上可以重新檢查 只能檢查自己追蹤頻道的影片 */
export async function recheckCaptionsAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { id: userId } = await requireSession();
  const videoId = formVideoId(formData);
  if (!videoId) return { error: INVALID_FORM_MESSAGE };
  try {
    return await run("重新檢查", async () => {
      const status = await checkFollowedVideoCaptions(userId, videoId);
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

/** 存不進去時帶回剛送出的專有名詞表 表單送出後會重設 打的內容才不會不見 */
export type SettingsFormState = FormState & { glossaryText?: string };

export async function saveSettingsAction(_prev: SettingsFormState, formData: FormData): Promise<SettingsFormState> {
  const { id: userId } = await requireSession();
  const provider = formText(formData, "provider");
  if (!isAiProvider(provider)) return { error: "請選擇 AI 供應商" };

  const field = (name: string) => Object.fromEntries(AI_PROVIDER_IDS.map((p) => [p, formText(formData, `${name}_${p}`)]));
  const glossaryText = formText(formData, "glossary");
  try {
    const result = await run("儲存設定", async () => {
      await saveSettings(userId, {
        provider,
        keys: field("key"),
        clear: AI_PROVIDER_IDS.filter((p) => formData.get(`clear_${p}`) === "on"),
        models: field("model"),
        glossaryText,
      });
      return "已儲存";
    });
    return result.error ? { ...result, glossaryText } : result;
  } finally {
    updateTags(youtubeTags.settings);
  }
}

/** needsSettings 代表金鑰沒設定或解不開 畫面附上翻譯設定的連結 */
export type StartState = StartResult | { ok: false; message: string; canUpload: false; needsSettings?: true };

const settingsFlag = (error: unknown) => (error instanceof ApiKeySetupError ? { needsSettings: true as const } : {});

// 開始 上傳 重試 重新翻譯與用我的 API Key 繼續翻譯成功後把影片加進保留清單
// 有寫入才讓保留清單失效

export async function startTranslationAction(videoId: string): Promise<StartState> {
  const { id: userId } = await requireSession();
  const tags = translationTags(videoId);
  try {
    const result = await startTranslation(userId, videoId);
    if (result.ok && (await keepTranslated(userId, videoId))) tags.push(youtubeTags.savedVideos);
    return result;
  } catch (error) {
    return { ok: false, message: userMessage(error, "開始翻譯"), canUpload: false, ...settingsFlag(error) };
  } finally {
    updateTags(...tags);
  }
}

export async function uploadSubtitlesAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireSession();
  const file = await readSubtitleFile(formData.get("file"));
  if ("error" in file) return { error: file.error };
  const videoId = formText(formData, "videoId");
  const tags = translationTags(videoId);
  try {
    return await run("上傳字幕", async () => {
      await uploadSubtitles(user, videoId, file.text);
      if (await keepTranslated(user.id, videoId)) tags.push(youtubeTags.savedVideos);
      return "已上傳，開始翻譯";
    });
  } finally {
    updateTags(...tags);
  }
}

export type ContinueActionError = { actionError: string; needsSettings?: true };

/**
 * saved 代表這次把影片自動加進了保留清單
 * 續翻不重繪頁面 觀看頁靠它把保留改成已保留
 */
export type ContinueResult = Progress & { saved?: true };

/**
 * join 只在按了用我的 API Key 繼續翻譯之後 續翻成功之前帶 true
 * 只決定要不要加進自己的保留清單 續翻本身照原本的規則
 */
export async function continueTranslationAction(videoId: string, positionMs?: number, join?: boolean): Promise<ContinueResult | ContinueActionError> {
  const { id: userId } = await requireSession();
  // Server Action 可以被直接 POST 播放位置不是正常的毫秒數就當成沒有
  const position = typeof positionMs === "number" && Number.isFinite(positionMs) && positionMs >= 0 ? positionMs : undefined;
  let saved = false;
  try {
    const progress = await continueTranslation(userId, videoId, { positionMs: position });
    // 別人正在翻也算 直接 POST 帶 true 也只會加進自己的清單 不必另外檢查權限
    // 這一批本來就要等 AI 所以當場寫入 結果才能放進回應
    saved = join === true && (await keepTranslated(userId, videoId));
    return saved ? { ...progress, saved: true } : progress;
  } catch (error) {
    return { actionError: userMessage(error, "翻譯"), ...settingsFlag(error) };
  } finally {
    // 每批寫回不能用 updateTag 會重繪頁面 翻譯面板重新掛載 回應還夾帶整份字幕
    // 所以等回應送出後才讓快取失效 保留清單也一樣
    const tags = translationTags(videoId);
    if (saved) tags.push(youtubeTags.savedVideos);
    if (tags.length > 0) after(() => expireTags(...tags));
  }
}

export async function retryTranslationAction(videoId: string): Promise<FormState> {
  const { id: userId } = await requireSession();
  const tags = translationTags(videoId);
  try {
    return await run("重試", async () => {
      await retryTranslation(userId, videoId);
      if (await keepTranslated(userId, videoId)) tags.push(youtubeTags.savedVideos);
    });
  } finally {
    updateTags(...tags);
  }
}

export async function restartTranslationAction(videoId: string): Promise<FormState> {
  const user = await requireSession();
  const tags = translationTags(videoId);
  try {
    return await run("重新翻譯", async () => {
      await restartTranslation(user, videoId);
      if (await keepTranslated(user.id, videoId)) tags.push(youtubeTags.savedVideos);
    });
  } finally {
    updateTags(...tags);
  }
}

/** 手動保留的不會被擠掉 滿了先擠掉最舊的自動項目 全是手動的就請使用者先移除一部 */
export async function saveVideoAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { id: userId } = await requireSession();
  const videoId = formVideoId(formData);
  if (!videoId) return { error: INVALID_FORM_MESSAGE };
  return run("保留影片", async () => {
    if ((await keepVideo(userId, videoId, { pinned: true, lookup: () => oembedSnapshot(videoId) })) === "full") return { error: SAVED_FULL_MESSAGE };
    updateTags(youtubeTags.savedVideos);
  });
}

/** 例如在別的分頁移除過 已經不在清單裡也算成功 畫面更新成實際狀態 翻譯不跟著刪 */
export async function removeSavedVideoAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { id: userId } = await requireSession();
  const videoId = formVideoId(formData);
  if (!videoId) return { error: INVALID_FORM_MESSAGE };
  return run("移除保留的影片", async () => {
    await removeSavedVideo(userId, videoId);
    updateTags(youtubeTags.savedVideos);
  });
}
