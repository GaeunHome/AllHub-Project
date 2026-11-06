import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { taipeiDateKey } from "@/core/time";
import { TEST_SESSION, requireSession } from "@/dev/session-stub";
import { stubWeatherEnv } from "@/dev/test-env";
import { markup, mocksOf, textOf } from "@/dev/test-helpers";
import type { WeatherPlace } from "../../../data/schema";
import { cityPhoto, photoCredit } from "../../../lib/city-photos";
import { weekRows } from "../../weekly-view";

stubWeatherEnv();
vi.mock("@/core/auth", () => import("@/dev/session-stub"));
vi.mock("../../../service/cached", { spy: true });
vi.mock("@/core/ui/toast", () => import("@/dev/toast-stub"));

const cached = mocksOf(await import("../../../service/cached"), "cachedSettings", "cachedPlaces", "cachedCountyWeek", "cachedCountyHours", "cachedWorldWeek");
const { WeatherPageBody, WeekWithHours } = await import("../weather-page");

const html = async (place?: string) => markup((await WeatherPageBody({ searchParams: Promise.resolve({ place }) })) as ReactElement);
const RAIN = [{ date: taipeiDateKey(new Date()), weather: "短暫雨", high: 20, low: 15, rain: 70 }];
const place = (id: number, name: string) => ({ id, userId: TEST_SESSION.id, kind: "world", name, country: "us", latitude: 47.6, longitude: -122.3, timezone: "America/Los_Angeles", createdAt: new Date(), sortOrder: 0 }) satisfies WeatherPlace;

beforeEach(() => {
  requireSession.mockReset().mockResolvedValue(TEST_SESSION);
  cached.cachedSettings.mockReset().mockResolvedValue({ county: "臺北市", rainAlert: true, warningAlert: true });
  cached.cachedPlaces.mockReset().mockResolvedValue([]);
  cached.cachedCountyWeek.mockReset().mockResolvedValue(RAIN);
  cached.cachedCountyHours.mockReset().mockResolvedValue(null);
  cached.cachedWorldWeek.mockReset().mockResolvedValue({ days: RAIN, hours: [], utcOffsetSeconds: 0 });
});

describe("天氣頁的大圖", () => {
  it("內建地點用那個地點的照片 說明裡標示作者與授權", async () => {
    const photo = cityPhoto("臺北市");
    const page = await html();

    expect(page).toContain(`src="${photo?.src}"`);
    expect(textOf(page)).toContain(photo && photoCredit(photo));
  });

  it("預報讀不到時照片照常顯示", async () => {
    cached.cachedCountyWeek.mockResolvedValue(null);

    expect(await html()).toContain(`src="${cityPhoto("臺北市")?.src}"`);
  });

  it("舊的英文搜尋加進來的城市照常能用：退回照天氣挑的場景圖 沒有照片的標示", async () => {
    cached.cachedPlaces.mockResolvedValue([place(7, "Seattle, United States")]);
    const page = await html("7");

    expect(page).toContain('src="/images/scenes/weather-rain-day.svg"');
    expect(textOf(page)).toContain("Seattle, United States");
    expect(textOf(page)).not.toContain("照片：");
  });
});

describe("城市列：膠囊只放名稱 排序與移除在管理視窗（使用者要的：不用拖曳）", () => {
  beforeEach(() => {
    cached.cachedPlaces.mockResolvedValue([place(7, "東京"), place(8, "首爾")]);
  });

  it("膠囊上沒有把手與移除鈕 整顆就是連到那個城市的連結", async () => {
    const page = await html();

    expect(page).not.toContain("的順序");
    expect(page).not.toContain('aria-label="移除東京"');
    expect(page).toContain('href="/weather?place=7"');
    expect(page).toContain('href="/weather?place=8"');
  });

  it("首頁選的縣市排第一個", async () => {
    const page = await html();

    expect(page.indexOf(">臺北市<")).toBeLessThan(page.indexOf("東京"));
  });

  it("城市再多管理鈕都看得到：放在會橫向捲動的列外面", async () => {
    const page = await html();
    const row = page.match(/<nav[^>]*aria-label="城市".*?<\/nav>/)?.[0] ?? "";

    expect(textOf(row)).toContain("東京");
    expect(textOf(row)).not.toContain("管理");
    expect(textOf(page)).toContain("管理");
  });
});

describe("半夜打開：氣象署的第一段還是昨晚", () => {
  afterEach(() => vi.useRealTimers());

  it("台灣的第一列是真的今天，昨晚那一段不列，照片旁的數字也看今天", async () => {
    vi.useFakeTimers({ now: new Date("2026-11-07T03:20:00+08:00"), toFake: ["Date"] });
    cached.cachedCountyWeek.mockResolvedValue([
      { date: "2026-11-06", weather: "陰", high: 19, low: 15, rain: 80 },
      { date: "2026-11-07", weather: "晴", high: 28, low: 21, rain: 10 },
      { date: "2026-11-08", weather: "多雲", high: 26, low: 20, rain: 20 },
    ]);
    const page = await html();

    expect(textOf(page)).toContain("最高 28°");
    expect(textOf(page)).not.toContain("80%");
  });
});

describe("一週預報點開看每小時", () => {
  const rows = weekRows(RAIN);
  const NEXT_DAYS = "2099-01-01";
  const future = [{ time: `${NEXT_DAYS}T09:00`, temperature: 20, rain: 30, weather: "晴" }];
  const days = [...RAIN, { ...RAIN[0], date: NEXT_DAYS }];
  const buttons = (page: string) => page.match(/<button/g)?.length ?? 0;

  it("國外的每小時跟一週預報同一個回應 不用多問一次", async () => {
    await WeekWithHours({ rows: weekRows(days), county: null, week: { days, hours: future, utcOffsetSeconds: 0 } });

    expect(cached.cachedCountyHours).not.toHaveBeenCalled();
  });

  it("台灣另外讀氣象署 有每小時的那天才能點開", async () => {
    cached.cachedCountyHours.mockResolvedValue(future);

    const page = markup(await WeekWithHours({ rows: weekRows(days), county: "臺北市", week: { days, hours: null, utcOffsetSeconds: 8 * 3600 } }));

    expect(cached.cachedCountyHours).toHaveBeenCalledWith("臺北市");
    expect(buttons(page)).toBe(1);
  });

  it("讀不到每小時時一週預報照常 只是不能點開", async () => {
    const page = markup(await WeekWithHours({ rows, county: "臺北市", week: { days: RAIN, hours: null, utcOffsetSeconds: 8 * 3600 } }));

    expect(buttons(page)).toBe(0);
    expect(textOf(page)).toContain("70%");
  });
});
