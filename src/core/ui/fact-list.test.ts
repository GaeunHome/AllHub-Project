import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { markup } from "@/dev/test-helpers";
import { Fact, FactList } from "./fact-list";

// lint 規定 children 用第三個參數傳 型別上 children 卻是必填 所以 props 斷言成完整的型別
type FactProps = Parameters<typeof Fact>[0];
const fact = (props: Omit<FactProps, "children">, value: FactProps["children"]) => createElement(Fact, props as FactProps, value);

describe("標籤＋值的清單（FactList、Fact）", () => {
  it("是描述清單：報讀器把每個標籤跟它的值配成一對，標籤在前", () => {
    const html = markup(createElement(FactList, null, fact({ label: "總資產" }, "$1,234"), fact({ label: "空氣品質", layout: "line" }, createElement("span", null, "良好"))));

    expect(html).toMatch(/^<dl[^>]*>/);
    expect([...html.matchAll(/<dt[^>]*>(.*?)<\/dt><dd[^>]*>(.*?)<\/dd>/g)].map((m) => [m[1], m[2]])).toEqual([
      ["總資產", "$1,234"],
      ["空氣品質", "<span>良好</span>"],
    ]);
  });
});
