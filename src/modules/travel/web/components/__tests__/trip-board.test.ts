import { createElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { markup, textOf } from "@/dev/test-helpers";
import type { TripItem } from "../../../service/trips";
import { dayViews } from "../../trip-view";

vi.mock("@/core/auth", () => import("@/dev/session-stub"));
vi.mock("../../actions", () => ({ addCommentAction: vi.fn(), deleteCommentAction: vi.fn(), deleteItemAction: vi.fn(), moveItemAction: vi.fn(), addItemAction: vi.fn(), updateItemAction: vi.fn() }));

const { TripBoard } = await import("../trip-board");

const DAY = "2026-12-01";
const item = (id: number, title: string, day: string | null = DAY) => ({ id, tripId: 1, day, position: id, kind: "place", title, mapsUrl: null, lat: null, lng: null, note: null, stayMinutes: 60, travelMinutes: 30, fixedTime: null, version: 1 }) as TripItem;
const days = dayViews({ startDate: DAY, endDate: "2026-12-02" });
const comment = { id: 1, itemId: 1, userId: "u", authorName: "小明", body: "好", createdAt: new Date() };
const html = (items: TripItem[]) => markup(createElement(TripBoard, { tripId: 1, tripTitle: "東京", destination: "東京", days, items, comments: [comment], userId: "u", managerId: "u" }));

describe("行程卡片不擁擠（使用者要的）", () => {
  const page = html([item(1, "淺草寺"), item(2, "晴空塔")]);

  it("查地圖 留言與查路線都收成小圖示 不再是一排文字連結", () => {
    const text = textOf(page);

    expect(text).not.toContain("查地圖");
    expect(text).not.toContain("留言");
    expect(page).toContain('aria-label="在地圖上查「淺草寺」"');
    expect(page).toContain('aria-label="「淺草寺」的留言，1 則"');
    expect(page).toContain('aria-label="「晴空塔」的留言"');
  });

  it("留言數量還是看得到", () => {
    expect(textOf(page.match(/<li data-item-id="1".*?<\/li>/)?.[0] ?? "")).toContain("1");
  });

  it("兩站之間的交通時間照樣看得到 整行就是查路線的連結", () => {
    expect(textOf(page)).toContain("交通 30 分鐘");
    expect(page).toMatch(/<a [^>]*aria-label="交通 30 分鐘，查路線"/);
  });
});

describe("手機切換天數（使用者選的）", () => {
  it("每一天都有切換鈕 想去的點排最後", () => {
    const tabs = textOf(html([item(1, "淺草寺")]).match(/<nav[^>]*aria-label="切換天數".*?<\/nav>/)?.[0] ?? "");

    expect(tabs.indexOf("第 1 天")).toBeLessThan(tabs.indexOf("第 2 天"));
    expect(tabs.indexOf("第 2 天")).toBeLessThan(tabs.indexOf("想去的點"));
  });
});
