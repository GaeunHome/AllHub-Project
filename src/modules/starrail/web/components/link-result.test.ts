import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

const { LinkResultBanner, LinkResultView, shownLinkResult } = await import("./link-result");

const textOf = (markup: string) => markup.replace(/<[^>]+>/g, "");
const LINKED = { accountId: 9, message: "已連結 開拓者（台港澳服，900000001）", seq: 1 };

describe("連結帳號的結果（帳號分頁上方）", () => {
  it("成功：醒目的成功橫幅寫出連結了哪些帳號", () => {
    const markup = renderToStaticMarkup(createElement(LinkResultView, { result: LINKED }));

    expect(markup).toMatch(/^<div role="status" class="result-banner result-banner-success"/);
    expect(textOf(markup)).toBe("已連結 開拓者（台港澳服，900000001）");
    expect(markup).not.toContain("result-banner-warning");
  });

  it("cookie 少了 ltmid_v2：另外一個警告樣式的橫幅，不跟成功訊息混在一起", () => {
    const markup = renderToStaticMarkup(createElement(LinkResultView, { result: { ...LINKED, warning: "建議一併貼上 ltmid_v2，否則即時便箋可能失敗" } }));

    const banners = markup.match(/<div role="status" class="result-banner [^"]*"/g)!;
    expect(banners).toEqual(['<div role="status" class="result-banner result-banner-success"', '<div role="status" class="result-banner result-banner-warning"']);
    expect(textOf(markup)).toContain("建議一併貼上 ltmid_v2");
  });

  it("只在看著剛連結的帳號時顯示：切到別的帳號就收起來", () => {
    expect(shownLinkResult(LINKED, 9)).toBe(LINKED);
    expect(shownLinkResult(LINKED, 3)).toBeNull();
    expect(shownLinkResult(null, 9)).toBeNull();
  });

  it("還沒連結過：什麼都不畫", () => {
    expect(renderToStaticMarkup(createElement(LinkResultBanner, { accountId: 9 }))).toBe("");
  });
});
