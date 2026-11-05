import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TEST_SESSION, requireSession } from "@/dev/session-stub";
import { stubWeatherEnv } from "@/dev/test-env";
import { markup, mocksOf, textOf } from "@/dev/test-helpers";
import type { WeatherPlace } from "../../../data/schema";
import { cityPhoto, photoCredit } from "../../../lib/city-photos";

stubWeatherEnv();
vi.mock("@/core/auth", () => import("@/dev/session-stub"));
vi.mock("../../../service/cached", { spy: true });

const cached = mocksOf(await import("../../../service/cached"), "cachedSettings", "cachedPlaces", "cachedCountyWeek", "cachedWorldWeek");
const { WeatherPageBody } = await import("../weather-page");

const html = async (place?: string) => markup((await WeatherPageBody({ searchParams: Promise.resolve({ place }) })) as ReactElement);
const RAIN = [{ date: "2026-11-05", weather: "短暫雨", high: 20, low: 15, rain: 70 }];
const place = (id: number, name: string) => ({ id, userId: TEST_SESSION.id, kind: "world", name, country: "us", latitude: 47.6, longitude: -122.3, timezone: "America/Los_Angeles", createdAt: new Date() }) satisfies WeatherPlace;

beforeEach(() => {
  requireSession.mockReset().mockResolvedValue(TEST_SESSION);
  cached.cachedSettings.mockReset().mockResolvedValue({ county: "臺北市", rainAlert: true, warningAlert: true });
  cached.cachedPlaces.mockReset().mockResolvedValue([]);
  cached.cachedCountyWeek.mockReset().mockResolvedValue(RAIN);
  cached.cachedWorldWeek.mockReset().mockResolvedValue(RAIN);
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
