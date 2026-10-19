import "server-only";
import { and, eq } from "drizzle-orm";
import { decryptSecret, encryptSecret, reencryptEach } from "@/core/crypto";
import { db } from "@/core/db";
import { glossaryProblem, parseGlossary, type GlossaryEntry } from "../lib/parse";
import { AI_PROVIDER_IDS, AI_PROVIDER_NAMES, DEFAULT_MODELS, DEFAULT_PROVIDER, type AiConfig, type AiProvider } from "../lib/subtitles";
import { youtubeSettings } from "../data/schema";
import { ApiKeySetupError, TranslationUserError } from "./errors";

// 翻譯設定與 API Key 每人一列 userId 都是登入者 別人的設定讀不到也改不到
const settingsRow = (userId: string) => eq(youtubeSettings.userId, userId);

const KEY_COLUMNS = {
  anthropic: { key: "anthropicKey", model: "anthropicModel" },
  openai: { key: "openaiKey", model: "openaiModel" },
  gemini: { key: "geminiKey", model: "geminiModel" },
} as const;

/** 畫面只顯示 API Key 的前幾碼 認得出是哪一把就好 */
const KEY_PREFIX_LENGTH = 8;

async function loadSettings(userId: string) {
  const [row] = await db().select().from(youtubeSettings).where(settingsRow(userId));
  return row;
}

/** 解開後只留前 8 碼 解不開時回空字串 例如換了 ENCRYPTION_KEY 卻沒留舊的 */
function keyPrefix(encrypted: string): string {
  try {
    return decryptSecret(encrypted).slice(0, KEY_PREFIX_LENGTH);
  } catch {
    return "";
  }
}

export type SettingsView = {
  provider: AiProvider;
  /** 只有前 8 碼 null 代表沒設定 空字串是存了但解不開 */
  keys: Record<AiProvider, string | null>;
  /** 空字串代表用 defaultModels 表單只放自訂值 存檔才不會把預設值寫死進資料庫 */
  customModels: Record<AiProvider, string>;
  defaultModels: Record<AiProvider, string>;
  glossaryText: string;
};

export async function getSettingsView(userId: string): Promise<SettingsView> {
  const row = await loadSettings(userId);
  const pick = <T>(fn: (p: AiProvider) => T) => Object.fromEntries(AI_PROVIDER_IDS.map((p) => [p, fn(p)])) as Record<AiProvider, T>;
  return {
    provider: row?.provider ?? DEFAULT_PROVIDER,
    keys: pick((p) => {
      const encrypted = row?.[KEY_COLUMNS[p].key];
      return encrypted ? keyPrefix(encrypted) : null;
    }),
    customModels: pick((p) => row?.[KEY_COLUMNS[p].model] ?? ""),
    defaultModels: { ...DEFAULT_MODELS },
    glossaryText: (row?.glossary ?? []).map((g) => `${g.source}=${g.target}`).join("\n"),
  };
}

export type SettingsInput = {
  provider: AiProvider;
  /** 空字串或沒給就不變更 */
  keys: Partial<Record<AiProvider, string>>;
  clear: AiProvider[];
  /** 空字串代表改回預設 */
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
    if (input.clear.includes(provider)) values[columns.key] = null;
    else if (key) values[columns.key] = encryptSecret(key);
    const model = input.models[provider];
    if (model !== undefined) values[columns.model] = model.trim() || null;
  }

  // id 由資料庫從 2 開始自動編號 不會撞到單人版固定的 1
  await db()
    .insert(youtubeSettings)
    .values({ userId, ...values })
    .onConflictDoUpdate({ target: youtubeSettings.userId, set: values });
}

const missingKeyMessage = (provider: AiProvider) => `還沒設定 ${AI_PROVIDER_NAMES[provider]} 的 API Key，請先到「翻譯設定」填入`;

/** 觀看頁先確認 沒有金鑰就不自動翻譯 直接提示到設定頁填 不解密只看有沒有存 */
export async function missingApiKeyMessage(userId: string): Promise<string | null> {
  const row = await loadSettings(userId);
  const provider = row?.provider ?? DEFAULT_PROVIDER;
  return row?.[KEY_COLUMNS[provider].key] ? null : missingKeyMessage(provider);
}

/** 呼叫 AI 一律用這個人自己的 API Key 沒有就只能看別人翻好的部分 */
export async function currentAi(userId: string): Promise<{ ai: AiConfig; glossary: GlossaryEntry[] }> {
  const row = await loadSettings(userId);
  const provider = row?.provider ?? DEFAULT_PROVIDER;
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

/** 發起翻譯時存下這份 之後誰接著翻都用它 */
export async function glossaryOf(userId: string): Promise<GlossaryEntry[]> {
  return (await loadSettings(userId))?.glossary ?? [];
}

/** 換金鑰後把還沒用目前金鑰加密的 API Key 換掉 單把失敗不影響其他把 */
export async function reencryptApiKeys(): Promise<string> {
  const rows = await db().select().from(youtubeSettings).orderBy(youtubeSettings.id);
  const stored = rows.flatMap((row) =>
    AI_PROVIDER_IDS.flatMap((provider) => {
      const encrypted = row[KEY_COLUMNS[provider].key];
      return encrypted ? [{ id: row.id, provider, encrypted }] : [];
    }),
  );
  if (stored.length === 0) return "沒有設定 API Key";

  const { reencrypted, failed } = await reencryptEach(stored, {
    ciphertext: (item) => item.encrypted,
    write: async ({ id, provider, encrypted }, ciphertext) => {
      const column = KEY_COLUMNS[provider].key;
      const values: Partial<typeof youtubeSettings.$inferInsert> = {};
      values[column] = ciphertext;
      // 只在密文沒變時寫回 這期間在翻譯設定換上的新金鑰不能被舊的蓋掉
      const [updated] = await db()
        .update(youtubeSettings)
        .set(values)
        .where(and(eq(youtubeSettings.id, id), eq(youtubeSettings[column], encrypted)))
        .returning({ id: youtubeSettings.id });
      return Boolean(updated);
    },
    log: { module: "youtube", what: "API Key 重新加密失敗", context: (item) => item.provider },
  });
  return `${stored.length} 把 API Key，重新加密 ${reencrypted} 把${failed ? `（${failed} 把失敗，詳見伺服器 log）` : ""}`;
}
