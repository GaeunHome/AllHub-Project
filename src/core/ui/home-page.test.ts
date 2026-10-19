import { Fragment, createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { textOf } from "@/dev/test-helpers";
import type { ModuleInfo } from "../module";
import { HomePage } from "./home-page";

const MODULES: ModuleInfo[] = [
  { id: "twitch", name: "Twitch", href: "/twitch", description: "追蹤主播", icon: "/icons/brands/twitch.svg", accent: "violet" },
  { id: "garden", name: "花園", href: "/garden", description: "新模組還沒有首頁卡片", icon: "/icons/ui/flower-2.svg" },
];

const render = ({ withHalf = true }: { withHalf?: boolean } = {}) =>
  renderToStaticMarkup(
    createElement(HomePage, {
      modules: MODULES,
      wide: createElement(Fragment, null, createElement("p", { id: "wide-1" }, "整列寬的卡片"), createElement("p", { id: "wide-2" }, "另一張整列寬的卡片")),
      half: withHalf ? createElement("p", { id: "half" }, "超寬時佔半列的卡片") : undefined,
      compact: createElement(Fragment, null, createElement("p", { id: "compact-1" }, "並排的卡片"), createElement("p", { id: "compact-2" }, "另一張並排的卡片")),
    }),
  );
/** 未讀通知那張卡片的 class */
const notificationCard = (markup: string) => markup.match(/<section aria-labelledby="home-notifications"[^>]*class="([^"]*)"/)![1].split(" ");

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

  // 天氣加入後並排的是天氣 理財 未讀通知三張 兩欄時未讀通知自己一列旁邊空一格
  it("兩欄時未讀通知獨佔一整列（前面兩張一列，旁邊不會空一格）；超寬螢幕在 half 旁邊上下排時照樣一欄", () => {
    expect(notificationCard(render())).toEqual(expect.arrayContaining(["sm:col-span-2", "2xl:col-span-1"]));
    expect(notificationCard(render({ withHalf: false }))).toContain("sm:col-span-2");
    expect(notificationCard(render({ withHalf: false }))).not.toContain("2xl:col-span-1");
  });
});
