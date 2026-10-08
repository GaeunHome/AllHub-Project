import { describe, expect, it } from "vitest";
import { AI_PROVIDERS, SUBSCRIPTION_NOTE } from "./ai-providers";

describe("翻譯設定頁的 AI 供應商", () => {
  it("Claude、OpenAI 在前，Gemini 在後", () => {
    expect(AI_PROVIDERS.map((p) => p.id)).toEqual(["anthropic", "openai", "gemini"]);
  });

  it("Gemini 說明可以用 Google AI Studio 的免費 API Key 與它的限制", () => {
    expect(AI_PROVIDERS.find((p) => p.id === "gemini")?.note).toBe(
      "用 Google AI Studio 的免費 API Key（不需要訂閱，有每日用量上限；免費方案的內容可能被 Google 用來改善產品）",
    );
  });

  it("說明 ChatGPT Plus、Claude Pro、Gemini 這類訂閱方案不包含 API，要另外申請 API Key", () => {
    expect(SUBSCRIPTION_NOTE).toMatch(/ChatGPT Plus.*Claude Pro.*Gemini.*不包含 API.*另外申請 API Key/);
  });
});
