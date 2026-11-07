import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

// 使用者的話 不要用圓點間隔 應該要各自分開然後能一目了然
// 全站都一樣 測試與開發用的假資料不算
const SRC = join(import.meta.dirname, "..");
const SOURCE = /\.(ts|tsx|css)$/;
const SKIPPED_DIRS = new Set(["__tests__", "dev"]);
const DOT = /·|&middot;|&#183;|&#xb7;|\\u00b7/i;

const sourceFiles = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return SKIPPED_DIRS.has(entry.name) ? [] : sourceFiles(path);
    return SOURCE.test(entry.name) && !entry.name.includes(".test.") ? [path] : [];
  });

describe("全站的畫面不用圓點間隔", () => {
  it("正式程式裡沒有 · 這個字元（畫面的字與註解都算），要分開的東西用標籤加值、上下兩行或左右兩欄", () => {
    const dotted = sourceFiles(SRC).filter((file) => DOT.test(readFileSync(file, "utf8")));

    expect(dotted.map((file) => relative(SRC, file))).toEqual([]);
  });
});
