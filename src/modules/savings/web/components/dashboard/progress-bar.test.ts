import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ProgressBar } from "./progress-bar";

const render = (props: Parameters<typeof ProgressBar>[0]) => renderToStaticMarkup(createElement(ProgressBar, props));

describe("進度條", () => {
  it("超過 100% 畫滿就好，負的畫成 0", () => {
    expect(render({ percent: 135 })).toContain("width:100%");
    expect(render({ percent: -5 })).toContain("width:0%");
  });
});
