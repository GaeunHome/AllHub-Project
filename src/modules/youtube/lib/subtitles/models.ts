import type { AiProvider } from "./providers";

export type AiModelOption = { id: string; label: string };

/**
 * 翻譯設定的下拉選單 模型換代時只改這裡 每家第一個是預設 其他照便宜到貴
 * 要能用 translate.ts 的請求格式 OpenAI 要支援 chat/completions 與 JSON mode
 */
export const AI_MODELS: Record<AiProvider, readonly AiModelOption[]> = {
  anthropic: [
    { id: "claude-haiku-5-5", label: "Claude Haiku 5.5（預設，最便宜）" },
    { id: "claude-sonnet-5-5", label: "Claude Sonnet 5.5（價格中等）" },
    { id: "claude-opus-5-5", label: "Claude Opus 5.5（較貴）" },
    { id: "claude-fable-5-1", label: "Claude Fable 5.1（最貴）" },
  ],
  openai: [
    { id: "gpt-6-luna", label: "GPT-6 Luna（預設，最便宜）" },
    { id: "gpt-6.1-terra", label: "GPT-6.1 Terra（價格中等）" },
    { id: "gpt-6.1-sol", label: "GPT-6.1 Sol（較貴）" },
    { id: "gpt-6-astra", label: "GPT-6 Astra（最貴）" },
  ],
  gemini: [
    { id: "gemini-3.8-flash", label: "Gemini 3.8 Flash（預設）" },
    { id: "gemini-3.1-flash-lite", label: "Gemini 3.1 Flash-Lite（最便宜）" },
    { id: "gemini-3.5-flash-lite", label: "Gemini 3.5 Flash-Lite（便宜）" },
  ],
};

/** 還沒存過模型的人用這個 */
export const DEFAULT_MODELS: Record<AiProvider, string> = {
  anthropic: AI_MODELS.anthropic[0].id,
  openai: AI_MODELS.openai[0].id,
  gemini: AI_MODELS.gemini[0].id,
};

/** 下拉選單的選項 也是存檔時收的值 以前存的自訂模型不在清單裡時多一個 才不會被洗掉 */
export function modelOptions(provider: AiProvider, current: string): readonly AiModelOption[] {
  const listed = AI_MODELS[provider];
  return listed.some((model) => model.id === current) ? listed : [{ id: current, label: `目前設定：${current}` }, ...listed];
}
