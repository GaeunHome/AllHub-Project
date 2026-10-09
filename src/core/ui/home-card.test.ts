import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { CardError } from "./card-error-boundary";
import { HomeCard } from "./home-card";

const INFO = { id: "twitch", name: "Twitch", href: "/twitch", icon: "/icons/brands/twitch.svg", accent: "violet" } as const;
const textOf = (markup: string) => markup.replace(/<[^>]+>/g, "");

/** 還在等外部資料的內容 */
function Pending(): Promise<never> {
  return new Promise(() => {});
}

type CardProps = Parameters<typeof HomeCard>[0];
const props: Omit<CardProps, "children"> = { info: INFO, title: "正在直播", skeleton: createElement("p", null, "骨架") };
// children 照 lint 規定用第三個參數傳；型別上 children 是必填，props 斷言成完整的型別
const card = (child: ReactElement) => renderToStaticMarkup(createElement(HomeCard, props as CardProps, child));

describe("首頁卡片的外框（core/ui/home-card）", () => {
  it("標題、模組圖示與前往模組頁的連結先出現_內容還沒好時顯示骨架", () => {
    const markup = card(createElement(Pending));

    expect(markup).toContain('data-accent="violet"');
    expect(markup).toMatch(/<section[^>]*aria-labelledby="home-twitch"/);
    expect(markup).toMatch(/<h2[^>]*id="home-twitch"[^>]*>正在直播<\/h2>/);
    expect(markup).toMatch(/<a[^>]*href="\/twitch"[^>]*>.*Twitch/);
    expect(markup).toContain("/icons/brands/twitch.svg");
    expect(textOf(markup)).toContain("骨架");
  });

  it("內容好了就換成內容", () => {
    const markup = card(createElement("p", null, "兩位主播正在直播"));

    expect(textOf(markup)).toContain("兩位主播正在直播");
    expect(textOf(markup)).not.toContain("骨架");
  });
});

describe("卡片出錯時（CardError）", () => {
  it("不顯示錯誤內容（可能夾帶 SQL 參數或憑證），只說這張卡片暫時讀不到，可以重試", () => {
    const markup = renderToStaticMarkup(CardError({}, { error: new Error("password=hunter2 select * from core_users"), retry: vi.fn(), reset: vi.fn() }) as ReactElement);

    expect(markup).not.toContain("hunter2");
    expect(markup).not.toContain("core_users");
    expect(markup).toContain('role="alert"');
    expect(textOf(markup)).toContain("這張卡片暫時讀不到資料");
    expect(markup).toMatch(/<button[^>]*type="button"[^>]*>.*重試/);
  });
});
