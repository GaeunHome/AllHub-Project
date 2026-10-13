import { Fragment, createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ModuleInfo } from "../module";
import { HomePage } from "./home-page";

const MODULES: ModuleInfo[] = [
  { id: "twitch", name: "Twitch", href: "/twitch", description: "追蹤主播", icon: "/icons/brands/twitch.svg", accent: "violet" },
  { id: "garden", name: "花園", href: "/garden", description: "新模組還沒有首頁卡片" },
];
const textOf = (markup: string) => markup.replace(/<[^>]+>/g, "");

const render = (half: ReactNode = createElement("p", { id: "half" }, "超寬時佔半列的卡片")) =>
  renderToStaticMarkup(
    createElement(HomePage, {
      modules: MODULES,
      wide: createElement(Fragment, null, createElement("p", { id: "wide-1" }, "整列寬的卡片"), createElement("p", { id: "wide-2" }, "另一張整列寬的卡片")),
      half,
      compact: createElement("p", { id: "compact" }, "並排的卡片"),
    }),
  );
/** 包住這個元素的外框的 class */
const parentClassOf = (markup: string, id: string) => markup.match(new RegExp(`<div class="([^"]*)"><p id="${id}">`))?.[1].split(" ") ?? [];

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

describe("首頁的排欄（排欄寫在元素自己身上，不從外框挑第幾個子元素）", () => {
  it("寬卡片彼此不並排：包成一欄，超寬螢幕也撐滿整列", () => {
    const markup = render();

    expect(parentClassOf(markup, "wide-1")).toEqual(expect.arrayContaining(["page-stack", "2xl:col-span-2"]));
    expect(markup).toMatch(/<p id="wide-1">[^<]*<\/p><p id="wide-2">/);
  });

  it("超寬螢幕時 half 那張跟並排的那組（compact 與未讀通知）在同一列、各佔半列", () => {
    const markup = render();
    const grid = markup.match(/<div class="([^"]*)"><div class="[^"]*"><p id="wide-1">/)![1].split(" ");

    expect(grid).toContain("2xl:grid-cols-2");
    expect(markup).toMatch(/<\/div><p id="half">[^<]*<\/p><div class="[^"]*"><p id="compact">/);
    expect(parentClassOf(markup, "compact")).not.toContain("2xl:col-span-2");
  });

  it("同一列的卡片從上緣對齊、不互相拉高：便箋很長時，本月存款與未讀通知不會被拉到一樣高、底下留一大片空白", () => {
    const grid = render().match(/<div class="([^"]*)"><div class="[^"]*"><p id="wide-1">/)![1].split(" ");

    expect(grid).toContain("2xl:items-start");
  });

  it("超寬螢幕時並排的那組在右半邊改成上下排：寬度夠，而且比旁邊的便箋矮很多時不會留一大片空白", () => {
    expect(parentClassOf(render(), "compact")).toEqual(expect.arrayContaining(["sm:grid-cols-2", "2xl:grid-cols-1"]));
  });

  it("沒有 half 的卡片時，並排的那組在超寬螢幕也撐滿整列、照樣兩張並排", () => {
    const compact = parentClassOf(render(null), "compact");

    expect(compact).toContain("2xl:col-span-2");
    expect(compact).not.toContain("2xl:grid-cols-1");
  });

  it("不靠子元素的位置排欄：串流中的 Suspense 會在原地多一個 template，第幾個會算錯", () => {
    const markup = render().replaceAll("&amp;", "&").replaceAll("&gt;", ">");

    expect(markup).not.toMatch(/\[&>:(?:nth-|first-child|last-child|only-child|not\()/);
  });
});
