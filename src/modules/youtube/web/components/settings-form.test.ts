import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { SettingsView } from "../../service/ai-settings";

vi.mock("../actions", () => ({ saveSettingsAction: vi.fn() }));

const { SettingsForm } = await import("./settings-form");
const { AI_MODELS } = await import("../../lib/subtitles/models");

const SETTINGS: SettingsView = {
  provider: "anthropic",
  keys: { anthropic: "sk-ant-a", openai: null, gemini: null },
  models: { anthropic: "claude-haiku-5-5", openai: "gpt-6-luna", gemini: "gemini-3.8-flash" },
  glossaryText: "민지=珉池",
};

describe("翻譯設定的表單：訂閱方案的說明", () => {
  const markup = renderToStaticMarkup(createElement(SettingsForm, { settings: SETTINGS }));
  const legend = markup.match(/<legend[^>]*>(?:(?!<\/legend>).)*翻譯使用的 AI(?:(?!<\/legend>).)*<\/legend>/)?.[0] ?? "";

  it("放在「翻譯使用的 AI」旁邊的 i 圓圈裡（滑過、鍵盤移到或點了才顯示），卡片裡不再另外放一段", () => {
    expect(legend).toMatch(/<button[^>]*aria-label="關於訂閱方案"/);
    expect(legend).toMatch(/<span[^>]*role="tooltip"[^>]*>ChatGPT Plus、Claude Pro、Gemini 這類訂閱方案都不包含 API，要另外申請 API Key。<\/span>/);
    expect(markup.split("這類訂閱方案都不包含 API")).toHaveLength(2);
    expect(markup).not.toContain('class="notice"');
    expect(markup).not.toContain("依用量計費");
  });

  it("選項這一組的名稱只有「翻譯使用的 AI」：報讀器進到選項時不會連 i 圓圈的名稱一起念", () => {
    const labelledBy = markup.match(/<fieldset[^>]*aria-labelledby="([^"]+)"[^>]*><legend[^>]*>(?:(?!<\/legend>).)*翻譯使用的 AI/)?.[1];

    expect(labelledBy).toBeTruthy();
    expect(markup).toContain(`<span id="${labelledBy}">翻譯使用的 AI</span>`);
  });
});

describe("翻譯設定的表單：API Key 只顯示前 8 碼", () => {
  /** 每個供應商的 API Key 輸入框 照 AI_PROVIDERS 的順序 Claude OpenAI Gemini */
  const keyInputs = (keys: SettingsView["keys"]) => [...renderToStaticMarkup(createElement(SettingsForm, { settings: { ...SETTINGS, keys } })).matchAll(/<input[^>]*name="key_[^"]*"[^>]*>/g)].map((m) => m[0]);

  it("已設定的寫出前 8 碼（不再是末 4 碼）；沒設定的寫未設定", () => {
    const [anthropic, openai] = keyInputs({ anthropic: "sk-ant-a", openai: null, gemini: null });

    expect(anthropic).toContain('placeholder="已設定（前 8 碼 sk-ant-a），留空表示不變更"');
    expect(openai).toContain('placeholder="未設定"');
  });

  it("輸入框照舊隱藏打的字（type=password），旁邊沒有切換顯示的按鈕", () => {
    const markup = renderToStaticMarkup(createElement(SettingsForm, { settings: SETTINGS }));

    for (const input of keyInputs(SETTINGS.keys)) expect(input).toContain('type="password"');
    expect(markup).not.toMatch(/aria-pressed|顯示密碼|隱藏密碼/);
  });

  it("存了但解不開（換了 ENCRYPTION_KEY 卻沒留舊的）_寫出要重新填入", () => {
    const [anthropic] = keyInputs({ anthropic: "", openai: null, gemini: null });

    expect(anthropic).toContain('placeholder="已設定（無法解密，請重新填入）"');
  });
});

describe("翻譯設定的表單：模型是下拉選單", () => {
  /** 每家的下拉選單 選項的值與字 還有選好的是哪一個 */
  const modelSelect = (provider: string, settings: SettingsView = SETTINGS) => {
    const markup = renderToStaticMarkup(createElement(SettingsForm, { settings }));
    const inner = new RegExp(`<select[^>]*name="model_${provider}"[^>]*>(.*?)</select>`).exec(markup)?.[1] ?? "";
    const options = [...inner.matchAll(/<option([^>]*)>([^<]*)<\/option>/g)].map(([, attributes, label]) => ({ value: /value="([^"]*)"/.exec(attributes)?.[1], selected: attributes.includes("selected"), label }));
    return { markup, options, values: options.map((option) => option.value), selected: options.filter((option) => option.selected).map((option) => option.value) };
  };

  it("選項跟著供應商：每家的卡片只列自己的模型，不是文字輸入框，也沒有空的選項可以留空", () => {
    const { markup, values: claude } = modelSelect("anthropic");

    expect(claude).toEqual(AI_MODELS.anthropic.map((model) => model.id));
    expect(modelSelect("openai").values).toEqual(AI_MODELS.openai.map((model) => model.id));
    expect(modelSelect("gemini").values).toEqual(AI_MODELS.gemini.map((model) => model.id));
    expect(claude).not.toContain("");
    expect(markup).not.toMatch(/<input[^>]*name="model_/);
    expect(markup).not.toContain("留空使用預設");
  });

  it("一進去就選好目前的模型", () => {
    expect(modelSelect("openai").selected).toEqual(["gpt-6-luna"]);
    expect(modelSelect("anthropic", { ...SETTINGS, models: { ...SETTINGS.models, anthropic: "claude-opus-5-5" } }).selected).toEqual(["claude-opus-5-5"]);
  });

  it("以前存的自訂模型不在清單裡：多一個「目前設定：<模型 id>」的選項並選好它，不會被洗掉", () => {
    const { options, selected } = modelSelect("openai", { ...SETTINGS, models: { ...SETTINGS.models, openai: "gpt-custom-2025" } });

    expect(selected).toEqual(["gpt-custom-2025"]);
    expect(options.find((option) => option.value === "gpt-custom-2025")?.label).toBe("目前設定：gpt-custom-2025");
    expect(options).toHaveLength(AI_MODELS.openai.length + 1);
  });

  it("目前的模型在清單裡：不多一個選項", () => {
    expect(modelSelect("gemini").options.map((option) => option.label).join()).not.toContain("目前設定");
  });
});
