import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AnimatedNumber } from "./animated-number";

const render = (props: Parameters<typeof AnimatedNumber>[0]) => renderToStaticMarkup(createElement(AnimatedNumber, props));

describe("金額往上數（伺服器算繪）", () => {
  it("報讀器讀到最後的數字；畫面上的數字也先寫最後的數字（開始數之前由 CSS 藏著，不會先露出誤導的 $0）、對報讀器隱藏；另外留一份看不見的最後數字撐住寬度，數的時候旁邊不會跳", () => {
    expect(render({ value: 43000 })).toBe(
      '<span class="fin-count"><span class="fin-count-final">$43,000</span><span aria-hidden="true" class="fin-count-box"><span class="fin-count-ghost">$43,000</span><span class="fin-count-value">$43,000</span></span></span>',
    );
  });
});
