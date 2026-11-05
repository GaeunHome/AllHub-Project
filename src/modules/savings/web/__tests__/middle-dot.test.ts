import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

// 使用者的話 不要用圓點間隔 應該要各自分開然後能一目了然
const MODULE_ROOT = join(import.meta.dirname, "../..");
const SOURCE = /\.(ts|tsx|css)$/;

const sourceFiles = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return SOURCE.test(entry.name) && !entry.name.includes(".test.") ? [path] : [];
  });

describe("理財的畫面不用圓點間隔", () => {
  it("正式程式裡沒有 · 這個字元（畫面的字與註解都算），要分開的東西用標籤加值、上下兩行或左右兩欄", () => {
    const dotted = sourceFiles(MODULE_ROOT).filter((file) => readFileSync(file, "utf8").includes("·"));

    expect(dotted.map((file) => relative(MODULE_ROOT, file))).toEqual([]);
  });
});
