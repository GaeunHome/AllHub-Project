import { describe, expect, it } from "vitest";
import { AI_MODELS, DEFAULT_MODELS, modelOptions } from "../models";
import { AI_PROVIDER_IDS } from "../providers";

describe("翻譯模型的清單", () => {
  it("Claude 是目前的四個模型", () => {
    expect(AI_MODELS.anthropic.map((model) => model.id).sort()).toEqual(["claude-fable-5-1", "claude-haiku-5-5", "claude-opus-5-5", "claude-sonnet-5-5"]);
  });

  it("預設模型：Claude 便宜的 Haiku、OpenAI 官方指定取代 gpt-4.1-mini 的 gpt-6-luna（舊的 2027 年 1 月下架）、Gemini 官方建議新專案用的 gemini-3.8-flash", () => {
    expect(DEFAULT_MODELS).toEqual({ anthropic: "claude-haiku-5-5", openai: "gpt-6-luna", gemini: "gemini-3.8-flash" });
  });

  it.each(AI_PROVIDER_IDS)("%s：預設模型在清單裡，沒有重複的 id", (provider) => {
    const ids = AI_MODELS[provider].map((model) => model.id);

    expect(ids).toContain(DEFAULT_MODELS[provider]);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("modelOptions：下拉選單的選項", () => {
  it("目前的模型在清單裡_就是原本的清單", () => {
    expect(modelOptions("anthropic", "claude-opus-5-5")).toEqual(AI_MODELS.anthropic);
  });

  it("目前的模型不在清單裡（以前存的自訂模型）_多一個「目前設定：<模型 id>」排最前面，清單照舊", () => {
    expect(modelOptions("openai", "gpt-custom-2025")).toEqual([{ id: "gpt-custom-2025", label: "目前設定：gpt-custom-2025" }, ...AI_MODELS.openai]);
  });

  it("別家的模型對這一家來說不在清單裡", () => {
    expect(modelOptions("gemini", "claude-haiku-5-5")[0]).toEqual({ id: "claude-haiku-5-5", label: "目前設定：claude-haiku-5-5" });
  });
});
