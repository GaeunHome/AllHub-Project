import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { OTHER_SESSION, TEST_SESSION, requireSession, usableModules } from "@/dev/session-stub";
import { textOf } from "@/dev/test-helpers";
import type { ModuleInfo } from "../../module";
import type { HomeSlot } from "../home-page";

vi.mock("@/core/auth", () => import("@/dev/session-stub"));

const { GreetingName, HomeCards, HomeModuleLinks, HomeNotices, HomePage } = await import("../home-page");

const MODULES: ModuleInfo[] = [
  { id: "twitch", name: "Twitch", href: "/twitch", description: "追蹤主播", icon: "/icons/brands/twitch.svg", accent: "violet" },
  { id: "garden", name: "花園", href: "/garden", description: "新模組還沒有首頁卡片", icon: "/icons/ui/flower-2.svg" },
  { id: "weather", name: "天氣", href: "/", description: "只有首頁卡片", icon: "/icons/ui/cloud-sun.svg", homeOnly: true },
];

const card = (id: string, text: string) => ({ id, card: createElement("p", { id }, text) });
const SLOTS = {
  top: [card("weather", "天氣的卡片"), card("reminders", "提醒的卡片")],
  wide: [card("twitch", "整列寬的卡片"), card("youtube", "另一張整列寬的卡片")],
  half: [card("starrail", "超寬時佔半列的卡片")],
  compact: [card("savings", "並排的卡片"), card("other", "另一張並排的卡片")],
};

const cards = async (slots: Partial<Record<keyof typeof SLOTS, HomeSlot[]>> = {}) => renderToStaticMarkup((await HomeCards({ ...SLOTS, ...slots })) as ReactElement);
/** 平常不出現的卡片 例如今天沒有行程時的旅遊 */
const hidden = (id: string, text: string) => ({ ...card(id, text), shown: async () => false });
const links = async () => renderToStaticMarkup((await HomeModuleLinks({ modules: MODULES })) as ReactElement);
/** 只留下這些模組以外的 跟資料庫關掉模組的效果一樣 */
const denyModules = (...ids: string[]) => usableModules.mockImplementation((async (items: { id: string }[]) => items.filter((item) => !ids.includes(item.id))) as typeof usableModules);
/** 未讀通知那張卡片的 class */
const notificationCard = (markup: string) => markup.match(/<section aria-labelledby="home-notifications"[^>]*class="([^"]*)"/)![1].split(" ");
const spans = (classes: string[]) => classes.filter((name) => name.includes("col-span"));

beforeEach(() => {
  usableModules.mockReset();
  requireSession.mockReset();
});

describe("首頁（core 只排版，卡片由 src/app 從各模組組合進來）", () => {
  it("有頁面的模組都有入口（縮成一排小連結），沒有首頁卡片的模組也找得到；只有首頁卡片的不列", async () => {
    const markup = await links();

    expect(markup).toMatch(/<a[^>]*href="\/twitch"[^>]*>.*Twitch/);
    expect(markup).toMatch(/<a[^>]*href="\/garden"[^>]*>.*花園/);
    expect(textOf(markup)).not.toContain("天氣");
  });

  it("最上面是天氣與提醒，再來整列寬的卡片、並排的卡片（手機上單欄時照這個順序）", async () => {
    const text = textOf(await cards());

    expect(text.indexOf("天氣的卡片")).toBeLessThan(text.indexOf("提醒的卡片"));
    expect(text.indexOf("提醒的卡片")).toBeLessThan(text.indexOf("整列寬的卡片"));
    expect(text.indexOf("整列寬的卡片")).toBeLessThan(text.indexOf("並排的卡片"));
  });

  it("並排的那一列最後是未讀通知的摘要，連到通知頁", async () => {
    const markup = await cards();
    const text = textOf(markup);

    expect(text.indexOf("並排的卡片")).toBeLessThan(text.indexOf("未讀通知"));
    expect(markup).toContain('href="/notifications"');
  });

  it("兩欄時未讀通知獨佔一整列（前面兩張一列，旁邊不會空一格）；超寬螢幕在 half 旁邊上下排時照樣一欄", async () => {
    expect(notificationCard(await cards())).toEqual(expect.arrayContaining(["sm:col-span-2", "2xl:col-span-1"]));
    expect(notificationCard(await cards({ half: [] }))).toContain("sm:col-span-2");
    expect(notificationCard(await cards({ half: [] }))).not.toContain("2xl:col-span-1");
  });

  it("並排的卡片是單數張時未讀通知補滿最後一格：兩欄時不跨欄，超寬螢幕在 half 旁邊上下排時照樣一欄", async () => {
    const compact = [card("savings", "並排的卡片")];

    expect(spans(notificationCard(await cards({ compact })))).toEqual([]);
    expect(spans(notificationCard(await cards({ compact, half: [] })))).toEqual([]);
  });
});

describe("首頁只列能用的模組", () => {
  it("被關掉的模組：入口與卡片都不出現，也不算繪那張卡片", async () => {
    denyModules("twitch", "savings");

    const text = textOf((await links()) + (await cards()));

    expect(text).not.toContain("Twitch");
    expect(text).toContain("另一張整列寬的卡片");
    expect(await cards()).not.toContain('id="twitch"');
    expect(await cards()).not.toContain('id="savings"');
  });

  it("是不是單數張照過濾後算：理財被關掉時並排只剩未讀通知，獨佔一整列，旁邊不空一格", async () => {
    const compact = [card("savings", "並排的卡片")];
    denyModules("savings");

    expect(spans(notificationCard(await cards({ compact, half: [] })))).toEqual(["sm:col-span-2"]);
  });

  it("天氣與提醒只剩一張時撐滿整列，旁邊不空一格", async () => {
    denyModules("reminders");

    const markup = await cards();

    expect(markup).not.toContain('id="reminders"');
    expect(markup.slice(0, markup.indexOf('id="weather"'))).not.toContain("sm:grid-cols-2");
  });

  it("整列寬的卡片全被關掉：不留空的一列", async () => {
    denyModules("twitch", "youtube");

    expect(await cards()).not.toContain("page-stack 2xl:col-span-2");
  });

  it("全部被關掉：只剩未讀通知", async () => {
    denyModules("weather", "reminders", "twitch", "youtube", "starrail", "savings", "other");

    const markup = await cards();

    expect(markup).toContain('aria-labelledby="home-notifications"');
    expect(markup.match(/<section/g)).toHaveLength(1);
    expect(markup).not.toMatch(/<p id=/);
  });

  it("今天要注意：被關掉的模組不算繪，別人看不出那個模組有事", async () => {
    denyModules("savings");

    const markup = renderToStaticMarkup((await HomeNotices({ notices: [card("savings", "理財的提示"), card("reminders", "提醒的提示")] })) as ReactElement);

    expect(textOf(markup)).toContain("提醒的提示");
    expect(textOf(markup)).not.toContain("理財的提示");
  });

  it("一開始的外框不列出任何模組：等讀到權限才出現，被關掉的模組不會先閃一下", () => {
    const markup = renderToStaticMarkup(createElement(HomePage, { modules: MODULES, notices: [card("savings", "要注意的事")], ...SLOTS }));

    expect(markup).toMatch(/<nav[^>]*aria-label="所有功能"/);
    expect(textOf(markup)).not.toContain("Twitch");
    expect(markup).not.toContain('id="twitch"');
  });
});

describe("首頁的問候語", () => {
  it("有暱稱用暱稱", async () => {
    requireSession.mockResolvedValue({ ...OTHER_SESSION, nickname: "小明" });

    expect(await GreetingName()).toContain("小明");
  });

  it("沒有暱稱用帳號名稱", async () => {
    requireSession.mockResolvedValue(TEST_SESSION);

    expect(await GreetingName()).toContain(TEST_SESSION.username);
  });
});

describe("平常不出現的卡片（使用者要的：旅遊今天沒有行程時首頁不要出現）", () => {
  it("shown 回 false_整張不算繪 連外框都沒有", async () => {
    const html = await cards({ compact: [card("savings", "並排的卡片"), hidden("travel", "旅遊的卡片")] });

    expect(html).not.toContain("旅遊的卡片");
  });

  it("shown 回 true_照常出現", async () => {
    const html = await cards({ compact: [{ ...card("travel", "旅遊的卡片"), shown: async () => true }] });

    expect(html).toContain("旅遊的卡片");
  });

  it("不出現的卡片不算格子 未讀通知才不會旁邊空一格", async () => {
    const onlySavings = [card("savings", "並排的卡片")];
    const withHidden = [...onlySavings, hidden("travel", "旅遊的卡片")];

    expect(spans(notificationCard(await cards({ compact: withHidden, half: [] })))).toEqual(spans(notificationCard(await cards({ compact: onlySavings, half: [] }))));
  });

  it("判斷時出錯_只藏那一張 首頁其他卡片照常", async () => {
    const html = await cards({ compact: [card("savings", "並排的卡片"), { ...card("travel", "旅遊的卡片"), shown: () => Promise.reject(new Error("db")) }] });

    expect(html).toContain("並排的卡片");
    expect(html).not.toContain("旅遊的卡片");
  });
});
