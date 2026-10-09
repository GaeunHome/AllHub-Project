import fs from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { THEME_INIT_SCRIPT, THEME_KEY, THEME_OPTIONS, applyTheme, parseThemePref } from "./theme";

/** 只記錄 data-theme 的假 <html> */
function fakeRoot(initial?: string) {
  const attributes = new Map<string, string>(initial ? [["data-theme", initial]] : []);
  return {
    attributes,
    setAttribute: vi.fn((name: string, value: string) => void attributes.set(name, value)),
    removeAttribute: vi.fn((name: string) => void attributes.delete(name)),
  };
}

/** 在假的 localStorage 與 document 上執行 <head> 裡的同步腳本 */
function runInitScript(getItem: (key: string) => string | null) {
  const root = fakeRoot();
  new Function("localStorage", "document", THEME_INIT_SCRIPT)({ getItem }, { documentElement: root });
  return root.attributes.get("data-theme");
}

describe("parseThemePref：存在瀏覽器的主題偏好", () => {
  it.each(["light", "dark", "system"])("%s_認得", (value) => {
    expect(parseThemePref(value)).toBe(value);
  });

  it.each(["", "Dark", "auto", "on"])("%j_認不得_回 undefined（改用預設的跟隨系統）", (value) => {
    expect(parseThemePref(value)).toBeUndefined();
  });

  it("選單的三個選項：淺色、深色、跟隨系統", () => {
    expect(THEME_OPTIONS.map((option) => [option.id, option.label])).toEqual([
      ["light", "淺色"],
      ["dark", "深色"],
      ["system", "跟隨系統"],
    ]);
  });
});

describe("applyTheme：套用到 <html data-theme>", () => {
  it.each(["light", "dark"] as const)("%s_寫進 data-theme", (pref) => {
    const root = fakeRoot();

    applyTheme(root, pref);

    expect(root.attributes.get("data-theme")).toBe(pref);
  });

  it("跟隨系統_拿掉 data-theme，交給 CSS 的 prefers-color-scheme", () => {
    const root = fakeRoot("dark");

    applyTheme(root, "system");

    expect(root.attributes.has("data-theme")).toBe(false);
    expect(root.setAttribute).not.toHaveBeenCalled();
  });
});

describe("THEME_INIT_SCRIPT：第一次繪製前套用存著的主題", () => {
  it("讀同一個 localStorage key", () => {
    const getItem = vi.fn(() => null);

    runInitScript(getItem);

    expect(getItem).toHaveBeenCalledWith(THEME_KEY);
  });

  it.each(["light", "dark"])("存著 %s_設上 data-theme", (stored) => {
    expect(runInitScript(() => stored)).toBe(stored);
  });

  it.each([
    ["跟隨系統", "system"],
    ["還沒存過", null],
    ["認不得的值", "<script>"],
  ])("%s_不設 data-theme", (_name, stored) => {
    expect(runInitScript(() => stored)).toBeUndefined();
  });

  it("localStorage 不能用（隱私模式）_不丟例外，維持跟隨系統", () => {
    expect(
      runInitScript(() => {
        throw new Error("SecurityError");
      }),
    ).toBeUndefined();
  });
});

describe("globals.css 的 dark variant", () => {
  const css = fs.readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8");
  const variant = /@custom-variant dark \{([\s\S]*?)\n\}/.exec(css)?.[1] ?? "";

  it("有 data-theme 時以它為準，沒有時跟隨系統", () => {
    expect(variant).toContain('[data-theme="dark"]');
    expect(variant).toContain("@media (prefers-color-scheme: dark)");
    expect(variant).toContain(':not([data-theme="light"], [data-theme="light"] *)');
  });

  it("深色的色值只寫在 dark variant 裡，不再直接用 prefers-color-scheme 換", () => {
    const outsideVariant = css.replace(variant, "");
    expect(outsideVariant).not.toContain("@media (prefers-color-scheme: dark)");
  });
});
