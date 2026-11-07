import "server-only";
import { and, eq, isNotNull } from "drizzle-orm";
import { decryptSecret, encryptSecret, reencryptEach } from "@/core/crypto";
import { db } from "@/core/db";
import { glossaryProblem, parseGlossary, type GlossaryEntry } from "../lib/parse";
import { AI_PROVIDER_IDS, AI_PROVIDER_NAMES, DEFAULT_MODELS, DEFAULT_PROVIDER, modelOptions, type AiConfig, type AiProvider } from "../lib/subtitles";
import { youtubeAiKeys, youtubeSettings } from "../data/schema";
import { ApiKeySetupError, TranslationUserError } from "./errors";

// userId 都是登入者 別人的設定讀不到也改不到
const settingsRow = (userId: string) => eq(youtubeSettings.userId, userId);

/** 畫面只顯示 API Key 的前幾碼 認得出是哪一把就好 */
const KEY_PREFIX_LENGTH = 8;

type KeyRow = typeof youtubeAiKeys.$inferSelect;
type Keys = Partial<Record<AiProvider, KeyRow>>;

async function loadSettings(userId: string) {
  const [[row], keyRows] = await Promise.all([db().select().from(youtubeSettings).where(settingsRow(userId)), db().select().from(youtubeAiKeys).where(eq(youtubeAiKeys.userId, userId))]);
  const keys: Keys = Object.fromEntries(keyRows.map((key) => [key.provider, key]));
  return { row, keys };
}

/** 實際會用的模型 沒存過的用預設 */
const modelOf = (keys: Keys, provider: AiProvider): string => keys[provider]?.model || DEFAULT_MODELS[provider];

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
  /** 實際會用的模型 下拉選單一進去就選好它 */
  models: Record<AiProvider, string>;
  glossaryText: string;
};

export async function getSettingsView(userId: string): Promise<SettingsView> {
  const { row, keys } = await loadSettings(userId);
  const pick = <T>(fn: (p: AiProvider) => T) => Object.fromEntries(AI_PROVIDER_IDS.map((p) => [p, fn(p)])) as Record<AiProvider, T>;
  return {
    provider: row?.provider ?? DEFAULT_PROVIDER,
    keys: pick((p) => {
      const encrypted = keys[p]?.apiKey;
      return encrypted ? keyPrefix(encrypted) : null;
    }),
    models: pick((p) => modelOf(keys, p)),
    glossaryText: (row?.glossary ?? []).map((g) => `${g.source}=${g.target}`).join("\n"),
  };
}

export type SettingsInput = {
  provider: AiProvider;
  /** 空字串或沒給就不變更 */
  keys: Partial<Record<AiProvider, string>>;
  clear: AiProvider[];
  /** 沒給就不變更 只收清單裡的或這個人原本存的 */
  models: Partial<Record<AiProvider, string>>;
  glossaryText: string;
};

function keyChange(input: SettingsInput, keys: Keys, provider: AiProvider): Partial<Pick<KeyRow, "apiKey" | "model">> {
  const change: Partial<Pick<KeyRow, "apiKey" | "model">> = {};
  const key = input.keys[provider]?.trim();
  if (input.clear.includes(provider)) change.apiKey = null;
  else if (key) change.apiKey = encryptSecret(key);
  const model = input.models[provider];
  if (model === undefined) return change;
  // Server Action 可以被直接 POST 不能只靠下拉選單
  if (!modelOptions(provider, modelOf(keys, provider)).some((option) => option.id === model)) {
    throw new TranslationUserError(`請從清單選擇 ${AI_PROVIDER_NAMES[provider]} 的模型`);
  }
  change.model = model;
  return change;
}

export async function saveSettings(userId: string, input: SettingsInput): Promise<void> {
  const glossary = parseGlossary(input.glossaryText);
  const problem = glossaryProblem(glossary);
  if (problem) throw new TranslationUserError(problem);
  const { keys } = await loadSettings(userId);
  const changes = AI_PROVIDER_IDS.flatMap((provider) => {
    const change = keyChange(input, keys, provider);
    return Object.keys(change).length > 0 ? [{ provider, change }] : [];
  });
  const values = { provider: input.provider, glossary, updatedAt: new Date() };

  await db().transaction(async (tx) => {
    await tx
      .insert(youtubeSettings)
      .values({ userId, ...values })
      .onConflictDoUpdate({ target: youtubeSettings.userId, set: values });
    for (const { provider, change } of changes) {
      await tx
        .insert(youtubeAiKeys)
        .values({ userId, provider, ...change })
        .onConflictDoUpdate({ target: [youtubeAiKeys.userId, youtubeAiKeys.provider], set: { ...change, updatedAt: values.updatedAt } });
    }
  });
}

const missingKeyMessage = (provider: AiProvider) => `還沒設定 ${AI_PROVIDER_NAMES[provider]} 的 API Key，請先到「翻譯設定」填入`;

/** 觀看頁先確認 沒有金鑰就不自動翻譯 直接提示到設定頁填 不解密只看有沒有存 */
export async function missingApiKeyMessage(userId: string): Promise<string | null> {
  const { row, keys } = await loadSettings(userId);
  const provider = row?.provider ?? DEFAULT_PROVIDER;
  return keys[provider]?.apiKey ? null : missingKeyMessage(provider);
}

/** 呼叫 AI 一律用這個人自己的 API Key 沒有就只能看別人翻好的部分 */
export async function currentAi(userId: string): Promise<{ ai: AiConfig; glossary: GlossaryEntry[] }> {
  const { row, keys } = await loadSettings(userId);
  const provider = row?.provider ?? DEFAULT_PROVIDER;
  const encrypted = keys[provider]?.apiKey;
  if (!row || !encrypted) throw new ApiKeySetupError(missingKeyMessage(provider));

  let apiKey: string;
  try {
    apiKey = decryptSecret(encrypted);
  } catch {
    throw new ApiKeySetupError(
      `${AI_PROVIDER_NAMES[provider]} 的 API Key 無法解密，請到「翻譯設定」重新填入（換過 ENCRYPTION_KEY 的話，把舊金鑰放進 ENCRYPTION_KEY_PREVIOUS 即可恢復）`,
    );
  }
  return { ai: { provider, apiKey, model: modelOf(keys, provider) }, glossary: row.glossary };
}

/** 發起翻譯時存下這份 之後誰接著翻都用它 */
export async function glossaryOf(userId: string): Promise<GlossaryEntry[]> {
  const [row] = await db().select({ glossary: youtubeSettings.glossary }).from(youtubeSettings).where(settingsRow(userId));
  return row?.glossary ?? [];
}

/** 換金鑰後把還沒用目前金鑰加密的 API Key 換掉 單把失敗不影響其他把 */
export async function reencryptApiKeys(): Promise<string> {
  const stored = await db()
    .select({ userId: youtubeAiKeys.userId, provider: youtubeAiKeys.provider, encrypted: youtubeAiKeys.apiKey })
    .from(youtubeAiKeys)
    .where(isNotNull(youtubeAiKeys.apiKey));
  if (stored.length === 0) return "沒有設定 API Key";

  const { reencrypted, failed } = await reencryptEach(stored, {
    ciphertext: (item) => item.encrypted as string,
    write: async ({ userId, provider, encrypted }, ciphertext) => {
      // 只在密文沒變時寫回 這期間在翻譯設定換上的新金鑰不能被舊的蓋掉
      const [updated] = await db()
        .update(youtubeAiKeys)
        .set({ apiKey: ciphertext })
        .where(and(eq(youtubeAiKeys.userId, userId), eq(youtubeAiKeys.provider, provider), eq(youtubeAiKeys.apiKey, encrypted as string)))
        .returning({ userId: youtubeAiKeys.userId });
      return Boolean(updated);
    },
    log: { module: "youtube", what: "API Key 重新加密失敗", context: (item) => item.provider },
  });
  return `${stored.length} 把 API Key，重新加密 ${reencrypted} 把${failed ? `（${failed} 把失敗，詳見伺服器 log）` : ""}`;
}
