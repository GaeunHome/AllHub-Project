import { describe, expect, it } from "vitest";
import { readStylesheet } from "@/dev/stylesheet";

// 使用者要的 停用的按鈕全站一個樣子 各模組不再各寫一套
const rules = [...readStylesheet().matchAll(/([^{};]+)\{([^{}]*)\}/g)].map(([, selector, body]) => ({ selector: selector.trim(), body }));
// :not(:disabled) 這類只是讓開停用的狀態 不算
const disabledSelector = (selector: string) => /:disabled|\[aria-disabled/.test(selector.replace(/:not\([^)]*\)/g, ""));
const setsLook = (body: string) => /(?:^|[\s;])(?:opacity|cursor)\s*:|@apply[^;]*\b(?:opacity|cursor)-/.test(body);

describe("停用的按鈕", () => {
  it("只有一條規則決定停用的樣子，同時涵蓋 disabled 與送出中標的 aria-disabled", () => {
    const looks = rules.filter(({ selector, body }) => disabledSelector(selector) && setsLook(body));

    expect(looks.map(({ selector }) => selector.replace(/\s+/g, " "))).toHaveLength(1);
    expect(looks[0].selector).toContain(":disabled");
    expect(looks[0].selector).toContain('[aria-disabled="true"]');
  });

  it("停用時滑過不換底色：主要、次要、危險與幽靈按鈕的 hover 都讓開 aria-disabled", () => {
    const hovers = rules.filter(({ selector }) => /^\.btn-(?:primary|secondary|danger|ghost):hover/.test(selector));

    expect(hovers.length).toBeGreaterThan(0);
    expect(hovers.filter(({ selector }) => !selector.includes("aria-disabled")).map(({ selector }) => selector)).toEqual([]);
  });
});
