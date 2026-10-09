import "server-only";
import { randomUUID } from "node:crypto";
import { and, eq, lt, or, sql } from "drizzle-orm";
import { decryptSecret, encryptSecret, needsReencrypt } from "@/core/crypto";
import { db } from "@/core/db";
import type { UserRole } from "@/core/db/schema";
import { logError } from "@/core/errors";
import { fetchVideoTitle } from "../lib/api";
import { glossaryProblem, parseGlossary, parseVideoId, withCommas, type GlossaryEntry } from "../lib/parse";
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
/** 上傳的字幕檔最多幾句：翻譯是共用的，接著翻的人要替整份字幕付費，太長多半是傳錯檔案 */
const MAX_UPLOAD_CUES = 5000;

export class TranslationUserError extends Error {}
/** 金鑰沒設定或解不開只能到「翻譯設定」處理，畫面要附上設定頁連結 */
export class ApiKeySetupError extends TranslationUserError {}

/** 操作翻譯的人（Server Action 傳 session 進來）：重新翻譯與換字幕要看他是不是發起人或站長 */
export type TranslationActor = { id: string; role: UserRole };

/** 翻譯共用，但重新翻譯、上傳字幕會蓋掉大家看的那一份：只有發起人或站長可以；發起人刪除帳號後（null）只剩站長 */
export function canManageTranslation(actor: TranslationActor, translation: Pick<YoutubeTranslation, "requestedBy">): boolean {
  return actor.role === "owner" || (translation.requestedBy !== null && translation.requestedBy === actor.id);
}

// ---------- 設定 ----------

// 翻譯設定與 API Key 每人一列（user_id）；userId 都是登入者，別人的設定讀不到也改不到
const settingsRow = (userId: string) => eq(youtubeSettings.userId, userId);

const KEY_COLUMNS = {
  anthropic: { key: "anthropicKey", hint: "anthropicKeyHint", model: "anthropicModel" },
  openai: { key: "openaiKey", hint: "openaiKeyHint", model: "openaiModel" },
  gemini: { key: "geminiKey", hint: "geminiKeyHint", model: "geminiModel" },
} as const;

async function loadSettings(userId: string) {
  const [row] = await db().select().from(youtubeSettings).where(settingsRow(userId));
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

export async function getSettingsView(userId: string): Promise<SettingsView> {
  const row = await loadSettings(userId);
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

export async function saveSettings(userId: string, input: SettingsInput): Promise<void> {
  const glossary = parseGlossary(input.glossaryText);
  const problem = glossaryProblem(glossary);
  if (problem) throw new TranslationUserError(problem);
  const values: Partial<typeof youtubeSettings.$inferInsert> = {
    provider: input.provider,
    glossary,
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

  // id 由資料庫自動編號（從 2 開始，不會撞到單人版固定的 1）
  await db()
    .insert(youtubeSettings)
    .values({ userId, ...values })
    .onConflictDoUpdate({ target: youtubeSettings.userId, set: values });
}

const missingKeyMessage = (provider: AiProvider) => `還沒設定 ${AI_PROVIDER_NAMES[provider]} 的 API Key，請先到「翻譯設定」填入`;

/** 觀看頁先確認，沒有金鑰就不自動開始翻譯、直接提示到設定頁填；不解密，只看有沒有存 */
export async function missingApiKeyMessage(userId: string): Promise<string | null> {
  const row = await loadSettings(userId);
  const provider = row?.provider ?? "anthropic";
  return row?.[KEY_COLUMNS[provider].key] ? null : missingKeyMessage(provider);
}

/** 呼叫 AI 一律用這個使用者自己的 API Key；沒有就只能看別人已經翻好的部分 */
async function currentAi(userId: string): Promise<{ ai: AiConfig; glossary: GlossaryEntry[] }> {
  const row = await loadSettings(userId);
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

/** 換金鑰後把每個人還沒用目前金鑰加密的 API Key 改用目前金鑰；單把失敗不影響其他把。沒有擁有者的列也處理：移除舊金鑰前要全部換好 */
export async function reencryptApiKeys(): Promise<string> {
  const rows = await db().select().from(youtubeSettings).orderBy(youtubeSettings.id);
  const stored = rows.flatMap((row) =>
    AI_PROVIDER_IDS.flatMap((provider) => {
      const encrypted = row[KEY_COLUMNS[provider].key];
      return encrypted ? [{ id: row.id, provider, encrypted }] : [];
    }),
  );
  if (stored.length === 0) return "沒有設定 API Key";

  let reencrypted = 0;
  let failed = 0;
  for (const { id, provider, encrypted } of stored.filter((s) => needsReencrypt(s.encrypted))) {
    const column = KEY_COLUMNS[provider].key;
    try {
      const values: Partial<typeof youtubeSettings.$inferInsert> = {};
      values[column] = encryptSecret(decryptSecret(encrypted));
      // 只在密文沒變時寫回：期間在「翻譯設定」換上的新金鑰不能被舊的蓋掉
      const [updated] = await db()
        .update(youtubeSettings)
        .set(values)
        .where(and(eq(youtubeSettings.id, id), eq(youtubeSettings[column], encrypted)))
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

/** 已經有翻譯時能不能蓋掉它，寫成 SQL 條件放進同一個寫入：檢查完到寫入之間發起人換了也不會蓋錯 */
const manageableBy = (actor: TranslationActor) => (actor.role === "owner" ? undefined : eq(youtubeTranslations.requestedBy, actor.id));

/** 換上新的來源字幕並從頭開始，userId 成為發起人、專有名詞表用他當下的設定；沒給 replaceAs 時已經有翻譯就沿用，給了就只有發起人或站長能蓋掉。回傳有沒有寫入 */
async function resetSource(userId: string, videoId: string, sourceKind: YoutubeTranslation["sourceKind"], cues: Cue[], replaceAs?: TranslationActor): Promise<boolean> {
  const fresh = {
    requestedBy: userId,
    glossary: await glossaryOf(userId),
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
  const insert = db()
    .insert(youtubeTranslations)
    .values({ videoId, title: await titleFor(videoId), ...fresh });
  const written = replaceAs
    ? await insert.onConflictDoUpdate({ target: youtubeTranslations.videoId, set: fresh, setWhere: manageableBy(replaceAs) }).returning({ id: youtubeTranslations.id })
    : await insert.onConflictDoNothing({ target: youtubeTranslations.videoId }).returning({ id: youtubeTranslations.id });
  return written.length > 0;
}

async function glossaryOf(userId: string): Promise<GlossaryEntry[]> {
  return (await loadSettings(userId))?.glossary ?? [];
}

const notManager = (action: string) => new TranslationUserError(`只有發起翻譯的人或站長可以${action}`);

export type StartResult = { ok: true } | { ok: false; message: string; canUpload: true };

/** 使用者在觀看頁按播放（自動即時翻譯）或「開始翻譯」：先確認有自己的金鑰，再抓 YouTube 上的韓文字幕；已經有紀錄（不論誰發起）就沿用，不重複花錢 */
export async function startTranslation(userId: string, input: string): Promise<StartResult> {
  const videoId = requireVideoId(input);
  await currentAi(userId);
  if (await getTranslation(videoId)) return { ok: true };

  const captions = await fetchKoreanCaptions(videoId);
  if (!captions.ok) return { ok: false, message: captions.message, canUpload: true };

  // 抓字幕的期間別人先開始了就沿用他的
  await resetSource(userId, videoId, captions.kind, captions.cues);
  return { ok: true };
}

/** 還沒有翻譯時誰都可以上傳（成為發起人）；已經有翻譯時會蓋掉大家看的那一份，只有發起人或站長可以 */
export async function uploadSubtitles(actor: TranslationActor, input: string, content: string): Promise<void> {
  const videoId = requireVideoId(input);
  let cues: Cue[];
  try {
    cues = parseSubtitles(content);
  } catch (error) {
    if (error instanceof SubtitleParseError) throw new TranslationUserError(error.message);
    throw error;
  }
  if (cues.length > MAX_UPLOAD_CUES) {
    throw new TranslationUserError(`字幕最多 ${withCommas(MAX_UPLOAD_CUES)} 句（這個檔案有 ${withCommas(cues.length)} 句），請確認是不是這支影片的字幕`);
  }
  if (!(await resetSource(actor.id, videoId, "upload", cues, actor))) throw notManager("上傳字幕");
}

/** 失敗後接著翻（保留已翻好的部分）：要有自己的 API Key 才能按，之後續翻也是用他的 */
export async function retryTranslation(userId: string, input: string): Promise<void> {
  const videoId = requireVideoId(input);
  await currentAi(userId);
  await db()
    .update(youtubeTranslations)
    .set({ status: "queued", error: null, lockId: null, updatedAt: new Date() })
    .where(and(eq(youtubeTranslations.videoId, videoId), eq(youtubeTranslations.status, "failed")));
}

/** 清空譯文從頭翻：只有發起人或站長可以；按的人成為新的發起人，專有名詞表換成他當下的設定 */
export async function restartTranslation(actor: TranslationActor, input: string): Promise<void> {
  const videoId = requireVideoId(input);
  // 譯文在資料庫裡依當下的 source_cues 重建：先讀再寫的話，中間剛好換了字幕檔，長度就會對不上
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
  // 沒寫入可能是還沒有翻譯（沒事可做），也可能不是發起人
  if (restarted.length === 0 && (await getTranslation(videoId))) throw notManager("重新翻譯");
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

/** 觀看頁要用的欄位：不含翻譯鎖（lock_id）、AI 設定與發起人的專有名詞表，可以放進共用的快取；發起人用來判斷能不能重新翻譯 */
export type TranslationView = Pick<YoutubeTranslation, "id" | "title" | "status" | "sourceKind" | "sourceCues" | "translated" | "error" | "updatedAt" | "requestedBy">;

export function progressOf(row: Pick<YoutubeTranslation, "status" | "translated" | "sourceCues" | "error">, busy = false): Progress {
  // 觀看中會從播放位置跳著翻，已翻句數要直接數，不能用 next_batch 推算
  const done = row.translated.filter((t) => t !== null).length;
  return { status: row.status, done, total: row.sourceCues.length, error: row.error, translated: row.translated, ...(busy ? { busy } : {}) };
}

/** 字幕內容的問題，換誰的 API Key 翻都一樣：才把共用的那一列標成失敗，畫面上的按鈕是「重試」 */
const CONTENT_HINTS: Partial<Record<AiError["kind"], string>> = {
  bad_output: "（AI 輸出格式不對，可以按「重試」）",
  refused: "，可以換一個模型再按「重試」",
};
/** 觀看者自己的金鑰、額度、頻率限制或連線問題：翻譯維持排隊中，畫面上的按鈕是「繼續翻譯」 */
const VIEWER_HINTS: Partial<Record<AiError["kind"], string>> = {
  rate_limit: "，之後按「繼續翻譯」",
  network: "，請稍後按「繼續翻譯」",
  other: "，可以按「繼續翻譯」",
};

const isContentError = (error: unknown): error is AiError => error instanceof AiError && error.kind in CONTENT_HINTS;

/** 錯誤只回給這次呼叫的人；非預期的錯誤原樣往上丟，Server Action 只回摘要、log 只記種類 */
function viewerError(error: unknown): unknown {
  if (!(error instanceof AiError)) return error;
  const message = error.message + (VIEWER_HINTS[error.kind] ?? "");
  return error.kind === "auth" ? new ApiKeySetupError(message) : new TranslationUserError(message);
}

export type ContinueOptions = {
  budgetMs?: number;
  now?: () => number;
  /** 觀看中的播放位置（毫秒），從這裡優先翻 */
  positionMs?: number;
};

/** 鎖已經被上傳、重新翻譯、重試或別的請求換掉：這個請求的結果不能再寫回 */
class LockLostError extends Error {}

/** 每批完成就寫回（中斷也不會白翻）；status=running 加 lock_id 當鎖，每次寫回都要 lock_id 相符，同一支影片同時只有一個請求在翻。用觀看者自己的 API Key、發起時的專有名詞表 */
export async function continueTranslation(
  userId: string,
  input: string,
  { budgetMs = DEFAULT_BUDGET_MS, now = Date.now, positionMs }: ContinueOptions = {},
): Promise<Progress> {
  const videoId = requireVideoId(input);
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

  // 誰接著翻都用發起時的專有名詞表，譯名才會一致；舊程式寫入的列沒有快照，用觀看者自己的
  const glossary = row.glossary ?? own;
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
    if (!isContentError(error)) {
      // 共用的翻譯不能因為某個人的金鑰失效或額度用完就變成失敗、其他人看到他的錯誤：放掉鎖，下一個人照常接著翻
      await writeOwned({ status: "queued", lockId: null });
      throw viewerError(error);
    }
    outcome = { status: "failed", error: error.message + CONTENT_HINTS[error.kind] };
  }

  // 釋放鎖；寫不進去代表剛好被別人換掉，以對方的狀態為準
  const [saved] = await writeOwned({ ...outcome, lockId: null }).returning();
  return saved ? progressOf(saved) : busy();
}
