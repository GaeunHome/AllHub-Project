import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = new URL("..", import.meta.url).pathname;

const sourceFiles = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === "__tests__" ? [] : sourceFiles(path);
    return path.endsWith(".tsx") || path.endsWith(".ts") ? [path] : [];
  });

// 說明寫在標籤裡 或經 tip hint 這類欄位傳進去
const TIP_TEXT = [/<InfoTip\b[^>]*>([\s\S]*?)<\/InfoTip>/g, /\btip=\{?("[^"]*"(?: : "[^"]*")?|account\.[^}]*)\}?/g, /\bhint: "([^"]*)"/g, /SUBSCRIPTION_NOTE = "([^"]*)"/g];

describe("全站的 i 圓圈", () => {
  it("使用者要的 只放精簡的說明 不用句號與分號", () => {
    const bad = sourceFiles(SRC).flatMap((file) => {
      const source = readFileSync(file, "utf8");
      return TIP_TEXT.flatMap((pattern) => [...source.matchAll(pattern)].map(([, text]) => text)).filter((text) => /[。；]/.test(text)).map((text) => `${file}: ${text.trim().slice(0, 30)}`);
    });

    expect(bad).toEqual([]);
  });

  it("使用者要的 一則不超過 40 個字 長的內容放到文件", () => {
    const long = sourceFiles(SRC).flatMap((file) => {
      const source = readFileSync(file, "utf8");
      return [...source.matchAll(TIP_TEXT[0])].map(([, text]) => text.replace(/\{\/\*[\s\S]*?\*\/\}|\{[^}]*\}|<[^>]*>|\s+/g, "")).filter((text) => text.length > 40).map((text) => `${file}: ${text}`);
    });

    expect(long).toEqual([]);
  });
});
