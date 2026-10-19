import type { ReactElement } from "react";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { OTHER_SESSION, TEST_SESSION, requireSession } from "@/dev/session-stub";
import { stubWeatherEnv } from "@/dev/test-env";
import { markup, mocksOf, textOf } from "@/dev/test-helpers";
import { forecastWith as forecast } from "../../dev/fixtures";

stubWeatherEnv();
vi.mock("@/core/auth", () => import("@/dev/session-stub"));
vi.mock("../../service/cached", { spy: true });

const cached = mocksOf(await import("../../service/cached"), "cachedSettings", "cachedForecast", "cachedStations");
const { WeatherSnapshot } = await import("./home-card");

const html = async () => markup((await WeatherSnapshot()) as ReactElement);
// 台北時間 10/19 早上 7 點 現在這一段是今天白天 下一段是今晚
const NOW = new Date("2026-10-18T23:00:00Z");

const forecastWith = (rains: (number | null)[]) => forecast(rains, { description: "陰短暫雨", minTemp: 21, maxTemp: 27 });

beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});
afterAll(() => {
  vi.useRealTimers();
});

beforeEach(() => {
  requireSession.mockReset().mockResolvedValue(TEST_SESSION);
  cached.cachedSettings.mockReset().mockResolvedValue({ county: "臺北市", rainAlert: true });
  cached.cachedForecast.mockReset().mockResolvedValue(forecastWith([70, 40]));
  cached.cachedStations.mockReset().mockResolvedValue([]);
});

describe("首頁的天氣卡片", () => {
  it("用登入者的 id 讀設定", async () => {
    requireSession.mockResolvedValue(OTHER_SESSION);

    await html();

    expect(cached.cachedSettings.mock.calls[0][0]).toBe(OTHER_SESSION.id);
  });

  it("降雨機率讀得到時在現在這一段旁邊提醒要不要帶傘：今天白天 70% 要帶傘", async () => {
    const text = textOf(await html());

    expect(text).toContain("記得帶傘");
    expect(text).toContain("今天白天降雨機率 70%");
  });

  it("兩段的降雨機率都讀不到時不提醒：卡片照樣顯示天氣", async () => {
    cached.cachedForecast.mockResolvedValue(forecastWith([null, null]));

    const text = textOf(await html());

    expect(text).toContain("陰短暫雨");
    expect(text).not.toContain("帶傘");
  });
});
