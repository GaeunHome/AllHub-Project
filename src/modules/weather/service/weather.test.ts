import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeFetch } from "@/dev/fake-fetch";
import { stubWeatherEnv, TEST_WEATHER_ENV } from "@/dev/test-env";
import { captureErrorLog, loggedText } from "@/dev/test-helpers";
import { cwaLocation, cwaResponse } from "../dev/fixtures";

// 照氣象署與環境部的回應格式手寫的最小範例
const SLOTS = [
  ["2026-10-16T18:00:00+08:00", "2026-10-17T06:00:00+08:00"],
  ["2026-10-17T06:00:00+08:00", "2026-10-17T18:00:00+08:00"],
  ["2026-10-17T18:00:00+08:00", "2026-10-18T06:00:00+08:00"],
];
const forecastJson = (county: string) => cwaResponse(cwaLocation(county, SLOTS.map(([start, end]) => ({ start, end, Wx: "多雲", PoP: "30", MinT: "24", CI: "舒適", MaxT: "29" }))));
const aqiJson = () => ({
  records: [
    { sitename: "士林", county: "臺北市", aqi: "35", publishtime: "2026/10/16 15:00:00" },
    { sitename: "前鎮", county: "高雄市", aqi: "156", publishtime: "2026/10/16 15:00:00" },
  ],
});

// env.ts 會記住第一次讀到的值 每個測試重新載入模組
const load = () => import("./weather");

beforeEach(() => vi.resetModules());
afterEach(() => vi.unstubAllEnvs());

describe("讀預報與空氣品質", () => {
  it("沒有授權碼時不對外請求，回 null（卡片改說明要設定）", async () => {
    vi.stubEnv("CWA_API_KEY", "");
    vi.stubEnv("MOENV_API_KEY", "");
    const { fetchForecast, fetchStations, weatherKeys } = await load();
    const fetch = fakeFetch(() => new Response("{}"));

    expect(weatherKeys()).toEqual({ forecast: false, airQuality: false });
    expect(await fetchForecast("臺北市", fetch.impl)).toBeNull();
    expect(await fetchStations(fetch.impl)).toBeNull();
    expect(fetch.calls).toEqual([]);
  });

  it("授權碼被拒（401）或連不上：回 null，log 只記錯誤種類與狀態碼，不含授權碼", async () => {
    stubWeatherEnv();
    const { fetchForecast, fetchStations } = await load();
    const log = captureErrorLog();

    expect(await fetchForecast("臺北市", fakeFetch(() => new Response("Unauthorized", { status: 401 })).impl)).toBeNull();
    expect(await fetchStations(fakeFetch(() => Promise.reject(new TypeError(`fetch failed ${TEST_WEATHER_ENV.MOENV_API_KEY}`))).impl)).toBeNull();

    const text = loggedText(log);
    expect(text).toContain("401");
    expect(text).toContain("TypeError");
    expect(text).not.toContain(TEST_WEATHER_ENV.CWA_API_KEY);
    expect(text).not.toContain(TEST_WEATHER_ENV.MOENV_API_KEY);
  });

  it("正常回應：預報只取選的縣市；空氣品質是全台的測站", async () => {
    stubWeatherEnv();
    const { fetchForecast, fetchStations } = await load();

    const forecast = await fetchForecast("高雄市", fakeFetch(() => Response.json(forecastJson("高雄市"))).impl);
    const stations = await fetchStations(fakeFetch(() => Response.json(aqiJson())).impl);

    expect(forecast).toMatchObject({ county: "高雄市", periods: expect.any(Array) });
    expect(forecast?.periods).toHaveLength(3);
    expect(stations?.map((station) => [station.county, station.aqi])).toEqual([["臺北市", 35], ["高雄市", 156]]);
  });
});
