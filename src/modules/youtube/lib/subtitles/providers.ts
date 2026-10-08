// 這個檔不 import 任何東西：資料表 schema 也用它產生 enum，drizzle-kit 載入 schema 時才不會牽連到其他檔案

/** 翻譯可以用的 AI 供應商；資料表的 enum、翻譯、設定頁都從這份清單來 */
export const AI_PROVIDER_IDS = ["anthropic", "openai", "gemini"] as const;

export type AiProvider = (typeof AI_PROVIDER_IDS)[number];

/** 錯誤訊息裡的供應商名稱 */
export const AI_PROVIDER_NAMES: Record<AiProvider, string> = { anthropic: "Claude", openai: "OpenAI", gemini: "Gemini" };

export const isAiProvider = (value: unknown): value is AiProvider => (AI_PROVIDER_IDS as readonly unknown[]).includes(value);
