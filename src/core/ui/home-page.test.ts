import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ModuleInfo } from "../module";
import { HomePage } from "./home-page";

const MODULES: ModuleInfo[] = [
  { id: "twitch", name: "Twitch", href: "/twitch", description: "追蹤主播", icon: "/icons/brands/twitch.svg", accent: "violet" },
  { id: "garden", name: "花園", href: "/garden", description: "新模組還沒有首頁卡片" },
];
const textOf = (markup: string) => markup.replace(/<[^>]+>/g, "");

const render = () =>
  renderToStaticMarkup(
    createElement(HomePage, {
      modules: MODULES,
      wide: createElement("p", null, "整列寬的卡片"),
      compact: createElement("p", null, "並排的卡片"),
    }),
  );

describe("首頁（core 只排版，卡片由 src/app 從各模組組合進來）", () => {
  it("每個模組都有入口（縮成一排小連結），沒有首頁卡片的模組也找得到", () => {
    const markup = render();

    expect(markup).toMatch(/<nav[^>]*aria-label="所有功能"/);
    expect(markup).toMatch(/<a[^>]*href="\/twitch"[^>]*>.*Twitch/);
    expect(markup).toMatch(/<a[^>]*href="\/garden"[^>]*>.*花園/);
  });

  it("整列寬的卡片在前，並排的卡片在後（手機上單欄時照這個順序）", () => {
    const text = textOf(render());

    expect(text).toContain("整列寬的卡片");
    expect(text.indexOf("整列寬的卡片")).toBeLessThan(text.indexOf("並排的卡片"));
  });

  it("並排的那一列最後是未讀通知的摘要，連到通知頁", () => {
    const markup = render();
    const text = textOf(markup);

    expect(text).toContain("未讀通知");
    expect(text.indexOf("並排的卡片")).toBeLessThan(text.indexOf("未讀通知"));
    expect(markup).toContain('href="/notifications"');
  });
});
