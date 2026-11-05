import { describe, expect, it } from "vitest";
import type { TripItem } from "../../service/trips";
import { deviceClock, todayView } from "../today-view";

const DAY = "2026-11-21";

const item = (id: number, position: number, stayMinutes: number, travelMinutes: number, overrides: Partial<TripItem> = {}): TripItem => ({
  id,
  tripId: 1,
  day: DAY,
  position,
  kind: "place",
  title: `第 ${id} 站`,
  mapsUrl: null,
  lat: null,
  lng: null,
  note: null,
  stayMinutes,
  travelMinutes,
  fixedTime: null,
  version: 1,
  ...overrides,
});

// 09:00 到 10:00 走 30 分鐘 10:30 到 12:00 走 30 分鐘 12:30 到 13:30
const ITEMS = [item(1, 0, 60, 0, { fixedTime: "09:00" }), item(2, 1, 90, 30), item(3, 2, 60, 30)];
const clock = (hour: number, minute = 0) => hour * 60 + minute;
const states = (minutes: number) => todayView(ITEMS, DAY, minutes).stops.map((stop) => stop.state);

describe("todayView：照現在幾點標出每一站", () => {
  it("還沒出發_第一站是下一站", () => {
    const view = todayView(ITEMS, DAY, clock(8));

    expect(view.next?.item.id).toBe(1);
    expect(view.here).toBeNull();
    expect(states(clock(8))).toEqual(["next", "later", "later"]);
  });

  it("停留中_這一站是現在 下一站是之後那一站", () => {
    const view = todayView(ITEMS, DAY, clock(9, 30));

    expect(view.here?.item.id).toBe(1);
    expect(view.next?.item.id).toBe(2);
    expect(states(clock(9, 30))).toEqual(["here", "next", "later"]);
  });

  it("兩站之間在路上_沒有現在 下一站是要去的那一站", () => {
    const view = todayView(ITEMS, DAY, clock(10, 10));

    expect(view.here).toBeNull();
    expect(view.next?.item.id).toBe(2);
    expect(states(clock(10, 10))).toEqual(["done", "next", "later"]);
  });

  it("剛好到達那一分鐘算到了 剛好離開那一分鐘算走了", () => {
    expect(states(clock(10, 30))).toEqual(["done", "here", "next"]);
    expect(states(clock(12))).toEqual(["done", "done", "next"]);
  });

  it("最後一站停留中_沒有下一站", () => {
    const view = todayView(ITEMS, DAY, clock(13));

    expect(view.here?.item.id).toBe(3);
    expect(view.next).toBeNull();
  });

  it("全部走完_沒有現在也沒有下一站 每一站都打勾", () => {
    const view = todayView(ITEMS, DAY, clock(14));

    expect(view.here).toBeNull();
    expect(view.next).toBeNull();
    expect(states(clock(14))).toEqual(["done", "done", "done"]);
  });

  it("只看今天的項目 照排的順序 想去的點與別天的不算", () => {
    const items = [item(5, 1, 60, 0), item(6, 0, 60, 0), item(7, 0, 60, 0, { day: "2026-11-22" }), item(8, 0, 60, 0, { day: null })];

    expect(todayView(items, DAY, clock(8)).stops.map((stop) => stop.item.id)).toEqual([6, 5]);
  });

  it("今天沒排東西_沒有站也不出錯", () => {
    expect(todayView([], DAY, clock(8))).toEqual({ stops: [], here: null, next: null });
  });
});

describe("deviceClock：用手機自己的時區 人在國外才準", () => {
  it("回當地的日期與從午夜算起的分鐘", () => {
    expect(deviceClock(new Date(2026, 10, 21, 11, 30))).toEqual({ date: "2026-11-21", minutes: 690 });
  });

  it("月與日不足兩位要補零 跟項目的日期格式一樣", () => {
    expect(deviceClock(new Date(2026, 0, 5, 0, 0))).toEqual({ date: "2026-01-05", minutes: 0 });
  });
});
