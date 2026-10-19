import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { markup, textOf } from "@/dev/test-helpers";
import { MEDIA_GRID, MediaGridSkeleton } from "./media-grid";

// lint 規定 children 用第三個參數傳 型別上 children 卻是必填 所以 props 斷言成完整的型別
type SkeletonProps = Parameters<typeof MediaGridSkeleton>[0];

describe("首頁影音卡片的骨架（MediaGridSkeleton）", () => {
  const html = markup(createElement(MediaGridSkeleton, { label: "載入最新影片…" } as SkeletonProps, createElement("i", { className: "detail" })));

  it("報讀器聽到正在載入什麼", () => {
    expect(html).toMatch(/^<div role="status" aria-busy="true"/);
    expect(textOf(html)).toBe("載入最新影片…");
  });

  it("跟內容用同一套格線，載入完才不會跳動；縮圖旁邊放呼叫端給的文字骨架", () => {
    expect(html).toContain(`class="${MEDIA_GRID}"`);
    expect(html).toContain('<i class="detail"></i>');
  });
});
