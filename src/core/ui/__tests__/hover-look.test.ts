import { describe, expect, it } from "vitest";
import { readStylesheet } from "@/dev/stylesheet";

// 使用者回報過 白字的地方滑過變成淺灰底 字也是白的看不到
// 首頁卡片圖片標題列的前往連結 交通台鐵與公車卡片上的 ⋮ 與追蹤
const rules = [...readStylesheet().matchAll(/([^{};]+)\{([^{}]*)\}/g)].map(([, selector, body]) => ({ selector: selector.trim().replace(/\s+/g, " "), body }));
const hoverRules = rules.filter(({ selector }) => /(?:icon-button|btn-ghost|card-header-link)[^,]*(?::hover|\[aria-expanded="true"\])/.test(selector));
const backgrounds = (body: string) => [...body.matchAll(/background(?:-color)?\s*:\s*([^;]+)/g)].map(([, value]) => value.trim());

describe("滑過的底色", () => {
  it("圖示按鈕、幽靈按鈕與卡片標題列的連結滑過時底色跟著字色：一般地方是淡灰，白字的地方是淡白，不會白底白字", () => {
    expect(hoverRules.length).toBeGreaterThanOrEqual(3);
    const fixed = hoverRules.flatMap(({ selector, body }) => backgrounds(body).filter((value) => !value.includes("currentColor")).map((value) => `${selector} → ${value}`));

    expect(fixed).toEqual([]);
  });
});
