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
