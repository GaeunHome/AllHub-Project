import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from "vitest";
import { fakeFetch } from "@/dev/fake-fetch";
import { stubWeatherEnv, TEST_WEATHER_ENV } from "@/dev/test-env";
import { captureErrorLog, loggedText } from "@/dev/test-helpers";
import { cwaLocation, cwaResponse, cwaWarningLocation, cwaWarningResponse } from "../../dev/fixtures";

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
const load = () => import("../weather");

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

describe("讀每小時預報（F-D0047-089）", () => {
  const hourlyJson = {
    records: {
      Locations: [{ Location: [{ LocationName: "高雄市", WeatherElement: [{ ElementName: "溫度", Time: [{ DataTime: "2026-11-07T18:00:00+08:00", ElementValue: [{ Temperature: "26" }] }] }] }] }],
    },
  };

  it("沒有授權碼時不對外請求，回 null", async () => {
    vi.stubEnv("CWA_API_KEY", "");
    const { fetchCountyHours } = await load();
    const fetch = fakeFetch(() => new Response("{}"));

    expect(await fetchCountyHours("高雄市", fetch.impl)).toBeNull();
    expect(fetch.calls).toEqual([]);
  });

  it("只問選的縣市，參數是大寫開頭，帶授權碼", async () => {
    stubWeatherEnv();
    const { fetchCountyHours } = await load();
    const fetch = fakeFetch(() => Response.json(hourlyJson));

    expect(await fetchCountyHours("高雄市", fetch.impl)).toEqual([{ time: "2026-11-07T18:00", temperature: 26, rain: null, weather: null }]);

    const url = new URL(fetch.urls[0]);
    expect(url.pathname).toMatch(/F-D0047-089$/);
    expect(url.searchParams.get("LocationName")).toBe("高雄市");
    expect(url.searchParams.get("Authorization")).toBe(TEST_WEATHER_ENV.CWA_API_KEY);
  });

  it("授權碼被拒時回 null，log 不含授權碼", async () => {
    stubWeatherEnv();
    const logged = captureErrorLog();
    const { fetchCountyHours } = await load();

    expect(await fetchCountyHours("高雄市", fakeFetch(() => new Response("no", { status: 401 })).impl)).toBeNull();
    expect(loggedText(logged)).not.toContain(TEST_WEATHER_ENV.CWA_API_KEY);
  });
});

describe("讀國外的預報（Open-Meteo）", () => {
  const json = {
    utc_offset_seconds: 32400,
    hourly: { time: ["2026-11-07T12:00"], temperature_2m: [18.4], precipitation_probability: [10], weather_code: [1], relative_humidity_2m: [61] },
    daily: {
      time: ["2026-11-07"],
      weather_code: [1],
      temperature_2m_max: [19.6],
      temperature_2m_min: [12.2],
      precipitation_probability_max: [10],
      apparent_temperature_max: [18.6],
      apparent_temperature_min: [10.4],
      wind_speed_10m_max: [4.2],
      wind_direction_10m_dominant: [48],
      uv_index_max: [3.55],
      sunrise: ["2026-11-07T06:05"],
      sunset: ["2026-11-07T16:38"],
    },
  };

  it("一週、每小時與今天的細節在同一個請求裡，不多用額度；風速用每秒公尺，才對得上氣象署的風級表", async () => {
    const { fetchWorldWeek } = await load();
    const fetch = fakeFetch(() => Response.json(json));

    const week = await fetchWorldWeek({ latitude: 35.6895, longitude: 139.6917, timezone: "Asia/Tokyo" }, fetch.impl);

    expect(fetch.calls).toHaveLength(1);
    const url = new URL(fetch.urls[0]);
    expect(url.searchParams.get("wind_speed_unit")).toBe("ms");
    expect(url.searchParams.get("daily")?.split(",")).toEqual(expect.arrayContaining(["apparent_temperature_max", "apparent_temperature_min", "wind_speed_10m_max", "wind_direction_10m_dominant", "uv_index_max", "sunrise", "sunset"]));
    expect(url.searchParams.get("hourly")?.split(",")).toContain("relative_humidity_2m");
    expect(week?.days[0].details).toEqual({ feelsHigh: 19, feelsLow: 10, humidity: 61, wind: { direction: "東北風", level: 3 }, uv: 4, sunrise: "06:05", sunset: "16:38" });
    expect(week?.hours).toHaveLength(1);
  });
});

describe("讀天氣警特報（W-C0033-001）", () => {
  const HEAVY_RAIN = { phenomena: "大雨", significance: "特報", start: "2026-11-02 08:00:00", end: "2026-11-02 20:00:00" };

  function silenceWarnings() {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    onTestFinished(() => warn.mockRestore());
    return warn;
  }

  it("沒有授權碼時不對外請求，回 null", async () => {
    vi.stubEnv("CWA_API_KEY", "");
    const { fetchWarnings } = await load();
    const fetch = fakeFetch(() => new Response("{}"));

    expect(await fetchWarnings("臺北市", fetch.impl)).toBeNull();
    expect(await fetchWarnings(null, fetch.impl)).toBeNull();
    expect(fetch.calls).toEqual([]);
  });

  it("選了縣市時只問那個縣市，null 時不帶 locationName 全台一次讀；授權碼與格式照氣象署的參數", async () => {
    stubWeatherEnv();
    const { fetchWarnings } = await load();
    const fetch = fakeFetch(() => Response.json(cwaWarningResponse()));

    await fetchWarnings("高雄市", fetch.impl);
    await fetchWarnings(null, fetch.impl);

    const [one, all] = fetch.urls.map((url) => new URL(url));
    expect(one.origin + one.pathname).toBe("https://opendata.cwa.gov.tw/api/v1/rest/datastore/W-C0033-001");
    expect(Object.fromEntries(one.searchParams)).toEqual({ Authorization: TEST_WEATHER_ENV.CWA_API_KEY, locationName: "高雄市", format: "JSON" });
    expect(Object.fromEntries(all.searchParams)).toEqual({ Authorization: TEST_WEATHER_ENV.CWA_API_KEY, format: "JSON" });
  });

  it("回傳每個縣市的特報：沒有特報的縣市是空陣列，不是讀不到", async () => {
    stubWeatherEnv();
    const { fetchWarnings } = await load();

    const warnings = await fetchWarnings(null, fakeFetch(() => Response.json(cwaWarningResponse(cwaWarningLocation("臺北市", [HEAVY_RAIN]), cwaWarningLocation("高雄市", [])))).impl);

    expect(warnings?.get("臺北市")).toEqual([{ label: "大雨特報", severe: false, end: "2026-11-02T12:00:00.000Z" }]);
    expect(warnings?.get("高雄市")).toEqual([]);
  });

  it("授權碼被拒（401）、連不上或格式不對（records.location 不是陣列）回 null，log 不含授權碼", async () => {
    stubWeatherEnv();
    const { fetchWarnings } = await load();
    const log = captureErrorLog();
    const warn = silenceWarnings();

    expect(await fetchWarnings("臺北市", fakeFetch(() => new Response("Unauthorized", { status: 401 })).impl)).toBeNull();
    expect(await fetchWarnings("臺北市", fakeFetch(() => Promise.reject(new TypeError(`fetch failed ${TEST_WEATHER_ENV.CWA_API_KEY}`))).impl)).toBeNull();
    expect(await fetchWarnings("臺北市", fakeFetch(() => Response.json({ success: "false" })).impl)).toBeNull();

    const text = `${loggedText(log)} ${loggedText(warn)}`;
    expect(text).toContain("401");
    expect(text).toContain("TypeError");
    expect(text).toContain("records.location");
    expect(text).not.toContain(TEST_WEATHER_ENV.CWA_API_KEY);
  });

  it("少了欄位時特報照常回傳，log 只記欄位名稱，不記縣市（看不出誰住哪裡）", async () => {
    stubWeatherEnv();
    const { fetchWarnings } = await load();
    const warn = silenceWarnings();

    const warnings = await fetchWarnings("金門縣", fakeFetch(() => Response.json(cwaWarningResponse(cwaWarningLocation("金門縣", [{ phenomena: "濃霧", significance: "特報" }])))).impl);

    expect(warnings?.get("金門縣")).toEqual([{ label: "濃霧特報", severe: false, end: null }]);
    expect(loggedText(warn)).toContain("hazards[].validTime.endTime");
    expect(loggedText(warn)).not.toContain("金門縣");
  });
});
