import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// 規則見 CLAUDE.md 的 YouTube 只在打開觀看頁播放或按開始翻譯時翻譯
// 新影片推送 排程與背景一律不自動翻譯
const MODULE_DIR = fileURLToPath(new URL("..", import.meta.url));
/** 定義翻譯流程的服務與觀看頁呼叫的 Server Action */
const ALLOWED = ["service/translation.ts", "web/actions.ts"];

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(abs);
    return /\.(ts|tsx|mjs)$/.test(entry.name) && !/\.test\.ts$/.test(entry.name) ? [path.relative(MODULE_DIR, abs).split(path.sep).join("/")] : [];
  });
}

describe("翻譯的觸發點", () => {
  it("只有觀看頁的 Server Action 會開始或續翻：WebSub 推送、排程與其他服務都不會", () => {
    const callers = sourceFiles(MODULE_DIR).filter(
      (file) => !ALLOWED.includes(file) && /\b(?:startTranslation|continueTranslation)\b/.test(fs.readFileSync(path.join(MODULE_DIR, file), "utf8")),
    );
    expect(callers).toEqual([]);
  });
});
