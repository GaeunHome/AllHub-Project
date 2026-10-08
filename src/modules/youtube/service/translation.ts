import "server-only";
import { randomUUID } from "node:crypto";
import { and, eq, lt, or, sql } from "drizzle-orm";
import { decryptSecret, encryptSecret, needsReencrypt } from "@/core/crypto";
import { db } from "@/core/db";
import { logError } from "@/core/errors";
import { fetchVideoTitle } from "../lib/api";
import { parseGlossary, parseVideoId, type GlossaryEntry } from "../lib/parse";
import { youtubeSettings, youtubeTranslations, type YoutubeTranslation } from "../data/schema";
import {
  AI_PROVIDER_IDS,
  AI_PROVIDER_NAMES,
  AI_TIMEOUT_MS,
  AiError,
  DEFAULT_MODELS,
  SubtitleParseError,
  countCompletedBatches,
  fetchKoreanCaptions,
  parseSubtitles,
  pickNextBatch,
  planBatches,
  translateBatch,
  type AiConfig,
  type AiProvider,
  type Cue,
} from "../lib/subtitles";
import { videoTitle } from "./channels";

/** Vercel 免費方案函式時限約 60 秒，留點餘裕；做不完就回進度，畫面會再呼叫一次 */
const DEFAULT_BUDGET_MS = 40_000;
/** 心跳在每次呼叫 AI 前更新，超過一次 AI 逾時再多 30 秒沒更新，才視為上一個處理者已中斷、可以接手 */
const LOCK_MS = AI_TIMEOUT_MS + 30_000;
const CONTEXT_LINES = 3;

export class TranslationUserError extends Error {}
/** 金鑰沒設定或解不開只能到「翻譯設定」處理，畫面要附上設定頁連結 */
export class ApiKeySetupError extends TranslationUserError {}

// ---------- 設定 ----------

/** 翻譯設定目前只有一列；改成每人一列時只要改這裡 */
const SETTINGS_ID = 1;
const settingsRow = () => eq(youtubeSettings.id, SETTINGS_ID);

const KEY_COLUMNS = {
  anthropic: { key: "anthropicKey", hint: "anthropicKeyHint", model: "anthropicModel" },
  openai: { key: "openaiKey", hint: "openaiKeyHint", model: "openaiModel" },
  gemini: { key: "geminiKey", hint: "geminiKeyHint", model: "geminiModel" },
} as const;

async function loadSettings() {
  const [row] = await db().select().from(youtubeSettings).where(settingsRow());
  return row;
}

export type SettingsView = {
  provider: AiProvider;
  /** 只有末 4 碼；null 代表沒設定 */
  keys: Record<AiProvider, string | null>;
  /** 空字串代表用 defaultModels；表單只放自訂值，存檔才不會把預設值寫死進資料庫 */
  customModels: Record<AiProvider, string>;
  defaultModels: Record<AiProvider, string>;
  glossaryText: string;
};

export async function getSettingsView(): Promise<SettingsView> {
  const row = await loadSettings();
  const pick = <T>(fn: (p: AiProvider) => T) => Object.fromEntries(AI_PROVIDER_IDS.map((p) => [p, fn(p)])) as Record<AiProvider, T>;
  return {
    provider: row?.provider ?? "anthropic",
    keys: pick((p) => (row?.[KEY_COLUMNS[p].key] ? (row[KEY_COLUMNS[p].hint] ?? "") : null)),
    customModels: pick((p) => row?.[KEY_COLUMNS[p].model] ?? ""),
    defaultModels: { ...DEFAULT_MODELS },
    glossaryText: (row?.glossary ?? []).map((g) => `${g.source}=${g.target}`).join("\n"),
  };
}

export type SettingsInput = {
  provider: AiProvider;
  /** 空字串或沒給 = 不變更 */
  keys: Partial<Record<AiProvider, string>>;
  clear: AiProvider[];
  /** 空字串 = 改回預設 */
  models: Partial<Record<AiProvider, string>>;
  glossaryText: string;
};

export async function saveSettings(input: SettingsInput): Promise<void> {
  const values: Partial<typeof youtubeSettings.$inferInsert> = {
    provider: input.provider,
    glossary: parseGlossary(input.glossaryText),
    updatedAt: new Date(),
  };
  for (const provider of AI_PROVIDER_IDS) {
    const columns = KEY_COLUMNS[provider];
    const key = input.keys[provider]?.trim();
    if (input.clear.includes(provider)) {
      values[columns.key] = null;
      values[columns.hint] = null;
    } else if (key) {
      values[columns.key] = encryptSecret(key);
      values[columns.hint] = key.slice(-4);
    }
    const model = input.models[provider];
    if (model !== undefined) values[columns.model] = model.trim() || null;
  }

  await db()
    .insert(youtubeSettings)
    .values({ id: SETTINGS_ID, ...values })
    .onConflictDoUpdate({ target: youtubeSettings.id, set: values });
}

const missingKeyMessage = (provider: AiProvider) => `還沒設定 ${AI_PROVIDER_NAMES[provider]} 的 API Key，請先到「翻譯設定」填入`;

/** 觀看頁先確認，沒有金鑰就不自動開始翻譯、直接提示到設定頁填；不解密，只看有沒有存 */
export async function missingApiKeyMessage(): Promise<string | null> {
  const row = await loadSettings();
  const provider = row?.provider ?? "anthropic";
  return row?.[KEY_COLUMNS[provider].key] ? null : missingKeyMessage(provider);
}

async function currentAi(): Promise<{ ai: AiConfig; glossary: GlossaryEntry[] }> {
  const row = await loadSettings();
  const provider = row?.provider ?? "anthropic";
  const columns = KEY_COLUMNS[provider];
  const encrypted = row?.[columns.key];
  if (!row || !encrypted) throw new ApiKeySetupError(missingKeyMessage(provider));

  let apiKey: string;
  try {
    apiKey = decryptSecret(encrypted);
  } catch {
    throw new ApiKeySetupError(
      `${AI_PROVIDER_NAMES[provider]} 的 API Key 無法解密，請到「翻譯設定」重新填入（換過 ENCRYPTION_KEY 的話，把舊金鑰放進 ENCRYPTION_KEY_PREVIOUS 即可恢復）`,
    );
  }
  return { ai: { provider, apiKey, model: row[columns.model] || DEFAULT_MODELS[provider] }, glossary: row.glossary };
}

/** 換金鑰後把還沒用目前金鑰加密的 API Key 改用目前金鑰；單把失敗不影響其他把 */
export async function reencryptApiKeys(): Promise<string> {
  const row = await loadSettings();
  const stored = AI_PROVIDER_IDS.flatMap((provider) => {
    const encrypted = row?.[KEY_COLUMNS[provider].key];
    return encrypted ? [{ provider, encrypted }] : [];
  });
  if (stored.length === 0) return "沒有設定 API Key";

  let reencrypted = 0;
  let failed = 0;
  for (const { provider, encrypted } of stored.filter((s) => needsReencrypt(s.encrypted))) {
    const column = KEY_COLUMNS[provider].key;
    try {
      const values: Partial<typeof youtubeSettings.$inferInsert> = {};
      values[column] = encryptSecret(decryptSecret(encrypted));
      // 只在密文沒變時寫回：期間在「翻譯設定」換上的新金鑰不能被舊的蓋掉
      const [updated] = await db()
        .update(youtubeSettings)
        .set(values)
        .where(and(settingsRow(), eq(youtubeSettings[column], encrypted)))
        .returning({ id: youtubeSettings.id });
      if (updated) reencrypted++;
    } catch (error) {
      failed++;
      logError("youtube", "API Key 重新加密失敗", error, provider);
    }
  }
  return `${stored.length} 把 API Key，重新加密 ${reencrypted} 把${failed ? `（${failed} 把失敗，詳見伺服器 log）` : ""}`;
}

// ---------- 翻譯紀錄 ----------

function requireVideoId(videoId: string): string {
  const id = parseVideoId(videoId);
  if (!id) throw new TranslationUserError("影片 ID 格式不正確");
  return id;
}

export async function getTranslation(videoId: string): Promise<YoutubeTranslation | undefined> {
  const [row] = await db().select().from(youtubeTranslations).where(eq(youtubeTranslations.videoId, videoId));
  return row;
}

/** 追蹤中頻道的影片用清單上的標題，其他影片向 YouTube 查 */
async function titleFor(videoId: string): Promise<string | null> {
  return (await videoTitle(videoId)) ?? (await fetchVideoTitle(videoId));
}

/** 換上新的來源字幕並從頭開始（第一次建立或改用上傳的字幕檔） */
async function resetSource(videoId: string, sourceKind: YoutubeTranslation["sourceKind"], cues: Cue[]): Promise<void> {
  const fresh = {
    status: "queued" as const,
    sourceKind,
    sourceCues: cues,
    translated: cues.map(() => null),
    // 翻譯順序由 pickNextBatch 依 translated 決定，這份規劃只用來記錄從頭連續翻好幾批（next_batch）
    batches: planBatches(cues),
    nextBatch: 0,
    error: null,
    lockId: null,
    updatedAt: new Date(),
  };
  await db()
    .insert(youtubeTranslations)
    .values({ videoId, title: await titleFor(videoId), ...fresh })
    .onConflictDoUpdate({ target: youtubeTranslations.videoId, set: fresh });
}

export type StartResult = { ok: true } | { ok: false; message: string; canUpload: true };

/** 使用者在觀看頁按播放（自動即時翻譯）或「開始翻譯」：先確認有金鑰，再抓 YouTube 上的韓文字幕；已經有紀錄就沿用（不重複花錢） */
export async function startTranslation(input: string): Promise<StartResult> {
  const videoId = requireVideoId(input);
  await currentAi();
  if (await getTranslation(videoId)) return { ok: true };

  const captions = await fetchKoreanCaptions(videoId);
  if (!captions.ok) return { ok: false, message: captions.message, canUpload: true };

  await resetSource(videoId, captions.kind, captions.cues);
  return { ok: true };
}

export async function uploadSubtitles(input: string, content: string): Promise<void> {
  const videoId = requireVideoId(input);
  let cues: Cue[];
  try {
    cues = parseSubtitles(content);
  } catch (error) {
    if (error instanceof SubtitleParseError) throw new TranslationUserError(error.message);
    throw error;
  }
  await resetSource(videoId, "upload", cues);
}

export async function retryTranslation(input: string): Promise<void> {
  const videoId = requireVideoId(input);
  await db()
    .update(youtubeTranslations)
    .set({ status: "queued", error: null, lockId: null, updatedAt: new Date() })
    .where(and(eq(youtubeTranslations.videoId, videoId), eq(youtubeTranslations.status, "failed")));
}

export async function restartTranslation(input: string): Promise<void> {
  const videoId = requireVideoId(input);
  // 譯文在資料庫裡依當下的 source_cues 重建：先讀再寫的話，中間剛好換了字幕檔，長度就會對不上
  const emptyTranslation = sql`(select coalesce(jsonb_agg(null::jsonb), '[]'::jsonb) from jsonb_array_elements(${youtubeTranslations.sourceCues}))`;
  await db()
    .update(youtubeTranslations)
    .set({ status: "queued", translated: emptyTranslation, nextBatch: 0, error: null, lockId: null, updatedAt: new Date() })
    .where(eq(youtubeTranslations.videoId, videoId));
}

export type Progress = {
  status: YoutubeTranslation["status"];
  /** 已翻好的句數 */
  done: number;
  total: number;
  error: string | null;
  translated: (string | null)[];
  /** 別的請求正在處理，這次什麼都沒做 */
  busy?: boolean;
};

/** 觀看頁要用的欄位：不含翻譯鎖（lock_id）與 AI 設定，可以放進快取 */
export type TranslationView = Pick<YoutubeTranslation, "id" | "title" | "status" | "sourceKind" | "sourceCues" | "translated" | "error" | "updatedAt">;

export function progressOf(row: Pick<YoutubeTranslation, "status" | "translated" | "sourceCues" | "error">, busy = false): Progress {
  // 觀看中會從播放位置跳著翻，已翻句數要直接數，不能用 next_batch 推算
  const done = row.translated.filter((t) => t !== null).length;
  return { status: row.status, done, total: row.sourceCues.length, error: row.error, translated: row.translated, ...(busy ? { busy } : {}) };
}

const HINTS: Record<AiError["kind"], string> = {
  auth: "",
  quota: "",
  rate_limit: "，之後按「重試」",
  bad_output: "（AI 輸出格式不對，可以按「重試」）",
  network: "，請稍後按「重試」",
  other: "，可以按「重試」",
};

function describeError(error: unknown): string {
  if (error instanceof AiError) return error.message + HINTS[error.kind];
  logError("youtube", "翻譯失敗", error);
  return "翻譯時發生錯誤（詳見伺服器 log），可以按「重試」";
}

export type ContinueOptions = {
  budgetMs?: number;
  now?: () => number;
  /** 觀看中的播放位置（毫秒），從這裡優先翻 */
  positionMs?: number;
};

/** 鎖已經被上傳、重新翻譯、重試或別的請求換掉：這個請求的結果不能再寫回 */
class LockLostError extends Error {}

/** 每批完成就寫回（中斷也不會白翻）；status=running 加 lock_id 當鎖，每次寫回都要 lock_id 相符，同一支影片同時只有一個請求在翻 */
export async function continueTranslation(
  input: string,
  { budgetMs = DEFAULT_BUDGET_MS, now = Date.now, positionMs }: ContinueOptions = {},
): Promise<Progress> {
  const videoId = requireVideoId(input);
  const existing = await getTranslation(videoId);
  if (!existing) throw new TranslationUserError("這支影片還沒開始翻譯");
  if (existing.status === "done" || existing.status === "failed") return progressOf(existing);

  const { ai, glossary } = await currentAi();
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
  /** 這次沒做事（別人正在翻，或鎖被拿走了），回報目前狀態 */
  const busy = async () => progressOf((await getTranslation(videoId)) ?? existing, true);
  if (!row) return busy();

  // 只在仍持有鎖時寫入，同時更新心跳
  const writeOwned = (values: Partial<typeof youtubeTranslations.$inferInsert>) =>
    db()
      .update(youtubeTranslations)
      .set({ ...values, updatedAt: new Date(now()) })
      .where(and(eq(youtubeTranslations.id, row.id), eq(youtubeTranslations.lockId, lockId)));
  const keepOwned = async (values: Partial<typeof youtubeTranslations.$inferInsert> = {}) => {
    const [kept] = await writeOwned(values).returning({ id: youtubeTranslations.id });
    if (!kept) throw new LockLostError();
  };

  const translated = [...row.translated];
  let batch = pickNextBatch(row.sourceCues, translated, positionMs);
  let lastBatchMs = 0;
  let outcome: Pick<YoutubeTranslation, "status" | "error">;

  try {
    for (let finished = 0; batch; finished++) {
      // 第一批一定做；觀看中翻完一批就回傳，字幕馬上出現、下一次呼叫也能跟上拖曳；否則預估下一批會超過預算才停，交給下一次呼叫
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
        // 一批最多呼叫 AI 兩次（句數不符會重試），每次之前都更新心跳；鎖被拿走就不再花錢
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
    outcome = { status: "failed", error: describeError(error) };
  }

  // 釋放鎖；寫不進去代表剛好被別人換掉，以對方的狀態為準
  const [saved] = await writeOwned({ ...outcome, lockId: null }).returning();
  return saved ? progressOf(saved) : busy();
}
