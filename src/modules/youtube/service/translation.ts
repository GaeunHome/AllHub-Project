import "server-only";
import { randomUUID } from "node:crypto";
import { and, eq, lt, or, sql } from "drizzle-orm";
import { db } from "@/core/db";
import type { UserRole } from "@/core/db/schema";
import { groupDigits } from "@/core/number";
import { parseVideoId } from "../lib/parse";
import { youtubeTranslations, type YoutubeTranslation } from "../data/schema";
import {
  AI_TIMEOUT_MS,
  AiError,
  SubtitleParseError,
  countCompletedBatches,
  fetchKoreanCaptions,
  parseSubtitles,
  pickNextBatch,
  planBatches,
  translateBatch,
  type Cue,
} from "../lib/subtitles";
import { currentAi, glossaryOf } from "./ai-settings";
import { videoTitle } from "./channels";
import { ApiKeySetupError, TranslationUserError } from "./errors";
import { videoInfo } from "./visuals";

/** Vercel 免費方案函式時限約 60 秒 留點餘裕 做不完就回進度 畫面會再呼叫一次 */
const DEFAULT_BUDGET_MS = 40_000;
/** 心跳在每次呼叫 AI 前更新 超過 AI 逾時再多 30 秒沒更新 才當成中斷可以接手 */
const LOCK_MS = AI_TIMEOUT_MS + 30_000;
const CONTEXT_LINES = 3;
/** 翻譯共用 接著翻的人要替整份字幕付費 太長多半是傳錯檔案 */
const MAX_UPLOAD_CUES = 5000;

/** 操作翻譯的人 重新翻譯與換字幕要看他是不是發起人或站長 */
export type TranslationActor = { id: string; role: UserRole };

/**
 * 重新翻譯與上傳字幕會蓋掉大家看的那一份 只有發起人或站長可以
 * 發起人刪了帳號就只剩站長
 */
export function canManageTranslation(actor: TranslationActor, translation: Pick<YoutubeTranslation, "requestedBy">): boolean {
  return actor.role === "owner" || (translation.requestedBy !== null && translation.requestedBy === actor.id);
}

// 翻譯紀錄

/** 收影片網址或 11 碼 id 看不懂就丟使用者錯誤 */
function videoIdFromInput(input: string): string {
  const id = parseVideoId(input);
  if (!id) throw new TranslationUserError("影片 ID 格式不正確");
  return id;
}

export async function getTranslation(videoId: string): Promise<YoutubeTranslation | undefined> {
  const [row] = await db().select().from(youtubeTranslations).where(eq(youtubeTranslations.videoId, videoId));
  return row;
}

/** 追蹤中頻道的影片用清單上的標題 其他向 YouTube 查 讀不到存 null 不影響翻譯 */
async function titleFor(videoId: string): Promise<string | null> {
  return (await videoTitle(videoId)) ?? (await videoInfo(videoId))?.title ?? null;
}

/** 能不能蓋掉已有的翻譯寫成 SQL 條件放進同一個寫入 中間發起人換了也不會蓋錯 */
const manageableBy = (actor: TranslationActor) => (actor.role === "owner" ? undefined : eq(youtubeTranslations.requestedBy, actor.id));

/**
 * 換上新的來源字幕從頭開始 userId 成為發起人 專有名詞表用他當下的設定
 * 沒給 replaceAs 就沿用已有的翻譯 給了只有發起人或站長能蓋掉 回傳有沒有寫入
 */
async function resetSource(userId: string, videoId: string, sourceKind: YoutubeTranslation["sourceKind"], cues: Cue[], replaceAs?: TranslationActor): Promise<boolean> {
  const fresh = {
    requestedBy: userId,
    glossary: await glossaryOf(userId),
    status: "queued" as const,
    sourceKind,
    sourceCues: cues,
    translated: cues.map(() => null),
    // 翻譯順序由 pickNextBatch 決定 這份規劃只用來記錄從頭連續翻好的批數
    batches: planBatches(cues),
    nextBatch: 0,
    error: null,
    lockId: null,
    updatedAt: new Date(),
  };
  const insert = db()
    .insert(youtubeTranslations)
    .values({ videoId, title: await titleFor(videoId), ...fresh });
  const written = replaceAs
    ? await insert.onConflictDoUpdate({ target: youtubeTranslations.videoId, set: fresh, setWhere: manageableBy(replaceAs) }).returning({ id: youtubeTranslations.id })
    : await insert.onConflictDoNothing({ target: youtubeTranslations.videoId }).returning({ id: youtubeTranslations.id });
  return written.length > 0;
}

const notManager = (action: string) => new TranslationUserError(`只有發起翻譯的人或站長可以${action}`);

export type StartResult = { ok: true } | { ok: false; message: string; canUpload: true };

/**
 * 觀看頁按播放或開始翻譯時呼叫 先確認有自己的金鑰再抓韓文字幕
 * 已經有紀錄就沿用 不論誰發起 不重複花錢
 */
export async function startTranslation(userId: string, input: string): Promise<StartResult> {
  const videoId = videoIdFromInput(input);
  await currentAi(userId);
  if (await getTranslation(videoId)) return { ok: true };

  const captions = await fetchKoreanCaptions(videoId);
  if (!captions.ok) return { ok: false, message: captions.message, canUpload: true };

  // 抓字幕的期間別人先開始了就沿用他的
  await resetSource(userId, videoId, captions.kind, captions.cues);
  return { ok: true };
}

/** 還沒有翻譯時誰都能上傳並成為發起人 已經有了就會蓋掉大家看的 只有發起人或站長可以 */
export async function uploadSubtitles(actor: TranslationActor, input: string, content: string): Promise<void> {
  const videoId = videoIdFromInput(input);
  let cues: Cue[];
  try {
    cues = parseSubtitles(content);
  } catch (error) {
    if (error instanceof SubtitleParseError) throw new TranslationUserError(error.message);
    throw error;
  }
  if (cues.length > MAX_UPLOAD_CUES) {
    throw new TranslationUserError(`字幕最多 ${groupDigits(MAX_UPLOAD_CUES)} 句（這個檔案有 ${groupDigits(cues.length)} 句），請確認是不是這支影片的字幕`);
  }
  if (!(await resetSource(actor.id, videoId, "upload", cues, actor))) throw notManager("上傳字幕");
}

/** 失敗後保留已翻好的接著翻 要有自己的 API Key 才能按 之後續翻也用他的 */
export async function retryTranslation(userId: string, input: string): Promise<void> {
  const videoId = videoIdFromInput(input);
  await currentAi(userId);
  await db()
    .update(youtubeTranslations)
    .set({ status: "queued", error: null, lockId: null, updatedAt: new Date() })
    .where(and(eq(youtubeTranslations.videoId, videoId), eq(youtubeTranslations.status, "failed")));
}

/** 清空譯文從頭翻 只有發起人或站長可以 按的人成為新的發起人 專有名詞表換成他當下的設定 */
export async function restartTranslation(actor: TranslationActor, input: string): Promise<void> {
  const videoId = videoIdFromInput(input);
  // 譯文在資料庫裡依當下的 source_cues 重建 先讀再寫的話中間換了字幕長度會對不上
  const emptyTranslation = sql`(select coalesce(jsonb_agg(null::jsonb), '[]'::jsonb) from jsonb_array_elements(${youtubeTranslations.sourceCues}))`;
  const restarted = await db()
    .update(youtubeTranslations)
    .set({
      status: "queued",
      translated: emptyTranslation,
      nextBatch: 0,
      error: null,
      lockId: null,
      updatedAt: new Date(),
      requestedBy: actor.id,
      glossary: await glossaryOf(actor.id),
    })
    .where(and(eq(youtubeTranslations.videoId, videoId), manageableBy(actor)))
    .returning({ id: youtubeTranslations.id });
  // 沒寫入可能是還沒有翻譯沒事可做 也可能不是發起人
  if (restarted.length === 0 && (await getTranslation(videoId))) throw notManager("重新翻譯");
}

export type Progress = {
  status: YoutubeTranslation["status"];
  /** 已翻好的句數 */
  done: number;
  total: number;
  error: string | null;
  translated: (string | null)[];
  /** 別的請求正在處理 這次什麼都沒做 */
  busy?: boolean;
};

/**
 * 觀看頁要用的欄位 不含翻譯鎖 AI 設定與發起人的名詞表 才能放進共用快取
 * 發起人用來判斷能不能重新翻譯
 */
export type TranslationView = Pick<YoutubeTranslation, "id" | "title" | "status" | "sourceKind" | "sourceCues" | "translated" | "error" | "updatedAt" | "requestedBy">;

export function progressOf(row: Pick<YoutubeTranslation, "status" | "translated" | "sourceCues" | "error">, busy = false): Progress {
  // 觀看中會從播放位置跳著翻 已翻句數要直接數 不能用 next_batch 推算
  const done = row.translated.filter((t) => t !== null).length;
  return { status: row.status, done, total: row.sourceCues.length, error: row.error, translated: row.translated, ...(busy ? { busy } : {}) };
}

/** 字幕內容的問題換誰的 Key 翻都一樣 所以才把共用的那一列標成失敗 按鈕是重試 */
const CONTENT_HINTS: Partial<Record<AiError["kind"], string>> = {
  bad_output: "（AI 輸出格式不對，可以按「重試」）",
  refused: "，可以換一個模型再按「重試」",
};
/** 觀看者自己的金鑰 額度 頻率或連線問題 翻譯維持排隊中 按鈕是繼續翻譯 */
const VIEWER_HINTS: Partial<Record<AiError["kind"], string>> = {
  rate_limit: "，之後按「繼續翻譯」",
  network: "，請稍後按「繼續翻譯」",
  other: "，可以按「繼續翻譯」",
};

const isContentError = (error: unknown): error is AiError => error instanceof AiError && error.kind in CONTENT_HINTS;

/** 錯誤只回給這次呼叫的人 非預期的原樣往上丟 由 Server Action 回摘要 log 只記種類 */
function viewerError(error: unknown): unknown {
  if (!(error instanceof AiError)) return error;
  const message = error.message + (VIEWER_HINTS[error.kind] ?? "");
  return error.kind === "auth" ? new ApiKeySetupError(message) : new TranslationUserError(message);
}

export type ContinueOptions = {
  budgetMs?: number;
  now?: () => number;
  /** 觀看中的播放位置 單位毫秒 從這裡優先翻 */
  positionMs?: number;
};

/** 鎖已經被上傳 重新翻譯 重試或別的請求換掉 這次的結果不能再寫回 */
class LockLostError extends Error {}

/**
 * 每批完成就寫回 中斷也不會白翻 running 加 lock_id 當鎖 每次寫回都要相符
 * 同一支影片同時只有一個請求在翻 用觀看者的 Key 與發起時的名詞表
 */
export async function continueTranslation(
  userId: string,
  input: string,
  { budgetMs = DEFAULT_BUDGET_MS, now = Date.now, positionMs }: ContinueOptions = {},
): Promise<Progress> {
  const videoId = videoIdFromInput(input);
  const existing = await getTranslation(videoId);
  if (!existing) throw new TranslationUserError("這支影片還沒開始翻譯");
  if (existing.status === "done" || existing.status === "failed") return progressOf(existing);

  const { ai, glossary: own } = await currentAi(userId);
  const started = now();
  const lockId = randomUUID();
  const [row] = await db()
    .update(youtubeTranslations)
    .set({ status: "running", lockId, provider: ai.provider, model: ai.model, updatedAt: new Date(started) })
    .where(
      and(
        eq(youtubeTranslations.videoId, videoId),
        or(
          eq(youtubeTranslations.status, "queued"),
          and(eq(youtubeTranslations.status, "running"), lt(youtubeTranslations.updatedAt, new Date(started - LOCK_MS))),
        ),
      ),
    )
    .returning();
  /** 別人正在翻或鎖被拿走了 這次沒做事 回報目前狀態 */
  const busy = async () => progressOf((await getTranslation(videoId)) ?? existing, true);
  if (!row) return busy();

  // 只在仍持有鎖時寫入 同時更新心跳
  const writeOwned = (values: Partial<typeof youtubeTranslations.$inferInsert>) =>
    db()
      .update(youtubeTranslations)
      .set({ ...values, updatedAt: new Date(now()) })
      .where(and(eq(youtubeTranslations.id, row.id), eq(youtubeTranslations.lockId, lockId)));
  const keepOwned = async (values: Partial<typeof youtubeTranslations.$inferInsert> = {}) => {
    const [kept] = await writeOwned(values).returning({ id: youtubeTranslations.id });
    if (!kept) throw new LockLostError();
  };

  // 誰接著翻都用發起時的名詞表 譯名才一致 舊程式寫的列沒有快照 用觀看者自己的
  const glossary = row.glossary ?? own;
  const translated = [...row.translated];
  let batch = pickNextBatch(row.sourceCues, translated, positionMs);
  let lastBatchMs = 0;
  let outcome: Pick<YoutubeTranslation, "status" | "error">;

  try {
    for (let finished = 0; batch; finished++) {
      // 第一批一定做 觀看中翻完一批就回傳 字幕馬上出現 下次呼叫也跟得上拖曳
      // 否則預估下一批會超過預算才停 交給下一次呼叫
      if (finished > 0 && (positionMs !== undefined || now() - started + lastBatchMs * 1.2 > budgetMs)) break;

      const { start, end } = batch;
      const batchStarted = now();
      const lines = await translateBatch({
        cues: row.sourceCues,
        batch,
        ai,
        glossary,
        context: {
          before: row.sourceCues.slice(Math.max(0, start - CONTEXT_LINES), start).map((c) => c.text),
          after: row.sourceCues.slice(end, end + CONTEXT_LINES).map((c) => c.text),
        },
        // 一批最多呼叫 AI 兩次 每次之前都更新心跳 鎖被拿走就不再花錢
        beforeCall: () => keepOwned(),
      });
      lastBatchMs = now() - batchStarted;

      lines.forEach((line, i) => (translated[start + i] = line));
      await keepOwned({ translated, nextBatch: countCompletedBatches(row.batches, translated) });
      batch = pickNextBatch(row.sourceCues, translated, positionMs);
    }
    outcome = { status: batch ? "queued" : "done", error: null };
  } catch (error) {
    if (error instanceof LockLostError) return busy();
    if (!isContentError(error)) {
      // 共用的翻譯不能因為某人的金鑰失效或額度用完就失敗 讓其他人看到他的錯誤
      // 所以放掉鎖 下一個人照常接著翻
      await writeOwned({ status: "queued", lockId: null });
      throw viewerError(error);
    }
    outcome = { status: "failed", error: error.message + CONTENT_HINTS[error.kind] };
  }

  // 釋放鎖 寫不進去代表剛好被別人換掉 以對方的狀態為準
  const [saved] = await writeOwned({ ...outcome, lockId: null }).returning();
  return saved ? progressOf(saved) : busy();
}
