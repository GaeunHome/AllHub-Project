import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { markup, textOf } from "@/dev/test-helpers";
import { CountBadge } from "./count-badge";

const badge = (props: Parameters<typeof CountBadge>[0]) => markup(createElement(CountBadge, props));

describe("未讀數的小圓標（CountBadge）", () => {
  it("沒有未讀_不顯示", () => {
    expect(badge({ count: 0 })).toBe("");
  });

  it("報讀器聽到「N 則未讀」；超過 99 只寫 99+，圓標才不會撐開膠囊", () => {
    expect(textOf(badge({ count: 7 }))).toBe("7 則未讀");
    expect(textOf(badge({ count: 120 }))).toBe("99+ 則未讀");
  });

  it("hidden（鈴鐺的按鈕名稱已經念了數字）_整個圓標不給報讀器，也不重複念則未讀", () => {
    const html = badge({ count: 3, hidden: true });

    expect(html).toMatch(/^<span aria-hidden="true"/);
    expect(textOf(html)).toBe("3");
  });
});
