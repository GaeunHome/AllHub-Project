import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { markup } from "@/dev/test-helpers";
import { EmptyState } from "../empty-state";

// 圖示 44 加間距 16
const ICON_WITH_GAP = 60;
// 視窗 640 兩欄的半張卡片 空狀態內容框實測 188.5 當時捲軸 15px Windows 的 17px 再少 1px
const NARROWEST_CONTENT = 187.5;

/** 文字欄的 flex 基準 px 讀不出來是 NaN */
function textBasis(): number {
  const html = markup(createElement(EmptyState, { compact: true, title: "還沒有提醒", hint: "記下重要的日子", action: createElement("button", null, "新增提醒") }));
  const column = html.match(/<div class="([^"]*)"><p class="font-semibold/)?.[1] ?? "";
  return Number(column.match(/flex-\[1_1_([\d.]+)rem\]/)?.[1]) * 16;
}

describe("卡片裡的小版空狀態（compact）", () => {
  it("文字欄有最小基準：基準是 0 時 flex-wrap 永遠不會換行，按鈕會把文字擠成一字一行（視窗 640 實測只剩 1px）", () => {
    expect(textBasis()).toBeGreaterThan(0);
  });

  it("基準放得進最窄的半張卡片：放不下時文字會掉到圖示下面，連沒有按鈕、只有幾個字的空狀態也會變樣", () => {
    expect(ICON_WITH_GAP + textBasis()).toBeLessThanOrEqual(NARROWEST_CONTENT);
  });
});
