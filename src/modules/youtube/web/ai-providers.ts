import type { AiProvider } from "../lib/subtitles/providers";

export type AiProviderOption = { id: AiProvider; name: string; keyHint: string; note?: string };

/** 使用者實際會用 Claude 或 OpenAI，放前面；Gemini 的訂閱帳號不能呼叫 API，放最後並說明免費 Key 的限制 */
export const AI_PROVIDERS: readonly AiProviderOption[] = [
  { id: "anthropic", name: "Claude（Anthropic）", keyHint: "console.anthropic.com → API Keys" },
  { id: "openai", name: "OpenAI", keyHint: "platform.openai.com → API keys" },
  {
    id: "gemini",
    name: "Gemini（Google）",
    keyHint: "aistudio.google.com → Get API key",
    note: "用 Google AI Studio 的免費 API Key（不需要訂閱，有每日用量上限；免費方案的內容可能被 Google 用來改善產品）",
  },
];

export const SUBSCRIPTION_NOTE = "ChatGPT Plus、Claude Pro、Gemini 這類訂閱方案都不包含 API，要另外申請 API Key（Claude、OpenAI 依用量計費）。";
