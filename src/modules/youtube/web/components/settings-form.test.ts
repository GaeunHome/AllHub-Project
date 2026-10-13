import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { SettingsView } from "../../service/translation";

vi.mock("../actions", () => ({ saveSettingsAction: vi.fn() }));

const { SettingsForm } = await import("./settings-form");

const SETTINGS: SettingsView = {
  provider: "anthropic",
  keys: { anthropic: "AB12", openai: null, gemini: null },
  customModels: { anthropic: "", openai: "", gemini: "" },
  defaultModels: { anthropic: "claude-haiku-4-5", openai: "gpt-4.1-mini", gemini: "gemini-3.8-flash" },
  glossaryText: "민지=珉池",
};

describe("翻譯設定的表單：寬螢幕三欄", () => {
  const markup = renderToStaticMarkup(createElement(SettingsForm, { settings: SETTINGS }));
  const formClasses = markup.match(/<form[^>]*class="([^"]*)"/)?.[1].split(/\s+/) ?? [];

  it("選 AI、三家 AI 的設定各一格；專有名詞表佔兩格、儲存那一列撐滿", () => {
    expect(formClasses).toContain("xl:grid-cols-3");
    expect(markup).toMatch(/<label class="[^"]*\bxl:col-span-2\b[^"]*"[^>]*>(?:(?!<\/label>).)*專有名詞表/);
    expect(markup).toMatch(/<div class="[^"]*\bxl:col-span-3\b[^"]*"[^>]*><button[^>]*>(?:(?!<\/button>).)*儲存/);
  });
});

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
