import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { taipeiDateKey } from "@/core/time";
import { TEST_SESSION, requireSession } from "@/dev/session-stub";
import { stubWeatherEnv } from "@/dev/test-env";
import { markup, mocksOf, textOf } from "@/dev/test-helpers";
import type { WeatherPlace } from "../../../data/schema";
import { NO_DETAILS, hourPoint, weekDay } from "../../../dev/fixtures";
import { cityPhoto, photoCredit } from "../../../lib/city-photos";
import type { PlaceTab } from "../../place-tabs";
import { weekRows } from "../../weekly-view";

stubWeatherEnv();
vi.mock("@/core/auth", () => import("@/dev/session-stub"));
vi.mock("../../../service/cached", { spy: true });
vi.mock("../../../service/weather", { spy: true });
vi.mock("@/core/ui/toast", () => import("@/dev/toast-stub"));

const cached = mocksOf(await import("../../../service/cached"), "cachedSettings", "cachedPlaces", "cachedCountyWeek", "cachedCountyHours", "cachedWorldWeek", "cachedStations", "cachedWarnings");
const keys = mocksOf(await import("../../../service/weather"), "weatherKeys");
const { WeatherPageBody, WeekWithHours } = await import("../weather-page");
const { NextHours } = await import("../../components/next-hours");
const { AirAndWarnings } = await import("../../components/air-and-warnings");
const { TodayDetailsWithHours } = await import("../../components/today-details");
const { CityOverview } = await import("../../components/city-overview");

const html = async (place?: string) => markup((await WeatherPageBody({ searchParams: Promise.resolve({ place }) })) as ReactElement);
const RAIN = [weekDay(taipeiDateKey(new Date()), { weather: "短暫雨", high: 20, low: 15, rain: 70 })];
const place = (id: number, name: string) => ({ id, userId: TEST_SESSION.id, kind: "world", name, country: "us", latitude: 47.6, longitude: -122.3, timezone: "America/Los_Angeles", createdAt: new Date(), sortOrder: 0 }) satisfies WeatherPlace;

beforeEach(() => {
  requireSession.mockReset().mockResolvedValue(TEST_SESSION);
  cached.cachedSettings.mockReset().mockResolvedValue({ county: "臺北市", rainAlert: true, warningAlert: true });
  cached.cachedPlaces.mockReset().mockResolvedValue([]);
  cached.cachedCountyWeek.mockReset().mockResolvedValue(RAIN);
  cached.cachedCountyHours.mockReset().mockResolvedValue(null);
  cached.cachedWorldWeek.mockReset().mockResolvedValue({ days: RAIN, hours: [], utcOffsetSeconds: 0 });
  cached.cachedStations.mockReset().mockResolvedValue([]);
  cached.cachedWarnings.mockReset().mockResolvedValue([]);
  keys.weatherKeys.mockReset().mockReturnValue({ forecast: true, airQuality: true });
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
      weekDay("2026-11-06", { weather: "陰", high: 19, low: 15, rain: 80 }),
      weekDay("2026-11-07", { weather: "晴", high: 28, low: 21, rain: 10 }),
      weekDay("2026-11-08", { weather: "多雲", high: 26, low: 20, rain: 20 }),
    ]);
    const page = await html();

    expect(textOf(page)).toContain("最高 28°");
    expect(textOf(page)).not.toContain("80%");
  });
});

describe("一週預報點開看每小時", () => {
  const rows = weekRows(RAIN);
  const NEXT_DAYS = "2099-01-01";
  const future = [hourPoint(`${NEXT_DAYS}T09:00`, { temperature: 20, rain: 30, weather: "晴" })];
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

describe("今天的細節：跟一週預報同一個回應 不多讀", () => {
  const TAIPEI = { feelsHigh: 27, feelsLow: 19, humidity: 78, dewPoint: 18, comfort: "舒適", wind: { direction: "東北風", level: 3, speed: 5, gust: null }, uv: 6, sunrise: null, sunset: null };

  it("台灣的縣市照一週預報的今天畫出體感溫度、濕度、風與紫外線，沒有日出日落", async () => {
    cached.cachedCountyWeek.mockResolvedValue([{ ...RAIN[0], details: TAIPEI }]);
    const text = textOf(await html(), { spaced: true });

    expect(text).toContain("體感溫度 19–27°");
    expect(text).toContain("濕度 78%");
    expect(text).toContain("風 東北風 3 級");
    expect(text).toContain("紫外線 6 高量級");
    expect(text).not.toContain("日出");
  });

  it("國外的城市多了日出與日落", async () => {
    cached.cachedPlaces.mockResolvedValue([place(7, "東京")]);
    cached.cachedWorldWeek.mockResolvedValue({ days: [{ ...RAIN[0], details: { ...NO_DETAILS, sunrise: "06:05", sunset: "16:38" } }], hours: [], utcOffsetSeconds: 0 });
    const text = textOf(await html("7"), { spaced: true });

    expect(text).toContain("日出 06:05");
    expect(text).toContain("日落 16:38");
  });

  it("台灣的每小時讀到後補上接下來 24 小時的最高最低在幾點：跟上面那一排共用同一份，不多讀", async () => {
    vi.useFakeTimers({ now: AFTERNOON, toFake: ["Date"] });
    const hour = (time: string, feels: number, humidity: number) => hourPoint(time, { feels, humidity });
    cached.cachedCountyHours.mockResolvedValue([hour("2026-11-07T15:00", 29, 60), hour("2026-11-08T05:00", 18, 90)]);
    const week = { days: [{ ...RAIN[0], details: TAIPEI }], hours: null, utcOffsetSeconds: 8 * 3600 };
    const text = textOf(markup(await TodayDetailsWithHours({ county: "臺北市", week, details: TAIPEI })), { spaced: true });
    vi.useRealTimers();

    expect(cached.cachedCountyHours).toHaveBeenCalledWith("臺北市");
    expect(text).toContain("最高 29° 15:00");
    expect(text).toContain("最低 18° 明天 05:00");
    expect(text).toContain("最高 90% 明天 05:00");
  });

  it("細節都讀不到時整區不出現", async () => {
    expect(textOf(await html())).not.toContain("今天的細節");
  });
});

// 台北時間 11/7 14:30
const AFTERNOON = new Date("2026-11-07T06:30:00Z");
const TODAY = "2026-11-07";

describe("接下來 24 小時：一直看得到的每小時", () => {
  beforeEach(() => vi.useFakeTimers({ now: AFTERNOON, toFake: ["Date"] }));
  afterEach(() => vi.useRealTimers());

  const hourly = (from: string, count: number) => Array.from({ length: count }, (_, index) => hourPoint(new Date(Date.parse(`${from}:00Z`) + index * 3_600_000).toISOString().slice(0, 16), { temperature: 20, rain: 30, weather: "晴" }));
  const items = (page: string) => page.match(/<li/g)?.length ?? 0;

  it("國外用一週預報同一個回應的每小時，從現在這一小時起列 24 格，不多問一次", async () => {
    const page = markup(await NextHours({ county: null, week: { days: [], hours: hourly("2026-11-07T03:00", 48), utcOffsetSeconds: 0 } }));

    expect(items(page)).toBe(24);
    expect(textOf(page)).toContain("06:00");
    expect(cached.cachedCountyHours).not.toHaveBeenCalled();
  });

  it("台灣另外讀氣象署的每小時", async () => {
    cached.cachedCountyHours.mockResolvedValue(hourly("2026-11-07T14:00", 30));
    const page = markup(await NextHours({ county: "臺北市", week: { days: [], hours: null, utcOffsetSeconds: 8 * 3600 } }));

    expect(cached.cachedCountyHours).toHaveBeenCalledWith("臺北市");
    expect(items(page)).toBe(24);
  });

  it("讀不到每小時時整區不出現", async () => {
    expect(await NextHours({ county: "臺北市", week: { days: [], hours: null, utcOffsetSeconds: 8 * 3600 } })).toBeNull();
  });
});

describe("空氣品質與特報：只有台灣的縣市", () => {
  beforeEach(() => vi.useFakeTimers({ now: AFTERNOON, toFake: ["Date"] }));
  afterEach(() => vi.useRealTimers());

  const section = async () => textOf(markup(await AirAndWarnings({ county: "臺北市" })), { spaced: true });

  it("台灣的縣市有這一區，國外的城市沒有", async () => {
    cached.cachedPlaces.mockResolvedValue([place(7, "東京")]);

    expect(textOf(await html())).toContain("空氣品質與特報");
    expect(textOf(await html("7"))).not.toContain("空氣品質");
    expect(textOf(await html("7"))).not.toContain("特報");
  });

  it("空氣品質照縣市裡最差的測站，還在生效的特報加上結束時間，已經結束的不列", async () => {
    cached.cachedStations.mockResolvedValue([
      { county: "臺北市", site: "士林", aqi: 35, publishedAt: "2026/11/07 14:00:00", pm25: null, pm10: null, o3: null, pollutant: null },
      { county: "臺北市", site: "萬華", aqi: 108, publishedAt: "2026/11/07 14:00:00", pm25: null, pm10: null, o3: null, pollutant: null },
      { county: "高雄市", site: "前鎮", aqi: 156, publishedAt: "2026/11/07 14:00:00", pm25: null, pm10: null, o3: null, pollutant: null },
    ]);
    cached.cachedWarnings.mockResolvedValue([
      { label: "大雨特報", severe: false, end: "2026-11-07T12:00:00.000Z" },
      { label: "濃霧特報", severe: false, end: "2026-11-07T04:00:00.000Z" },
    ]);
    const text = await section();

    expect(cached.cachedWarnings).toHaveBeenCalledWith("臺北市");
    expect(text).toContain("108");
    expect(text).toContain("對敏感族群不健康");
    expect(text).toContain("萬華");
    expect(text).not.toContain("前鎮");
    expect(text).toContain("大雨特報 到 20:00");
    expect(text).not.toContain("濃霧");
  });

  it("使用者選的污染物數字＋測站清單：PM2.5、PM10、臭氧、主要污染物與縣市裡每個測站，等級寫成一般的字，不用小標籤", async () => {
    const station = (site: string, aqi: number, pm25: number | null = null, pollutant: string | null = null) => ({ county: "臺北市" as const, site, aqi, publishedAt: "2026/11/07 14:00:00", pm25, pm10: pm25 && pm25 * 2, o3: 33, pollutant });
    cached.cachedStations.mockResolvedValue([station("士林", 35), station("萬華", 108, 41, "細懸浮微粒"), station("中山", 55)]);
    cached.cachedWarnings.mockResolvedValue([{ label: "大雨特報", severe: false, end: "2026-11-07T12:00:00.000Z" }]);
    const page = markup(await AirAndWarnings({ county: "臺北市" }));
    const text = textOf(page, { spaced: true });

    expect(text).toContain("PM2.5 41 μg/m³");
    expect(text).toContain("PM10 82 μg/m³");
    expect(text).toContain("臭氧 33 ppb");
    expect(text).toContain("主要污染物 細懸浮微粒");
    expect(text).toMatch(/各測站 萬華 108 .*中山 55 .*士林 35/);
    expect(page).not.toMatch(/class="[^"]*\bchip\b/);
  });

  it("沒有特報時直接說沒有", async () => {
    expect(await section()).toContain("目前沒有天氣特報");
  });

  it("讀不到時說暫時無法讀取，不說成沒有特報", async () => {
    cached.cachedStations.mockResolvedValue(null);
    cached.cachedWarnings.mockResolvedValue(null);
    const text = await section();

    expect(text).toContain("暫時無法讀取");
    expect(text).not.toContain("目前沒有");
  });

  it("沒設環境部的授權碼時不讀也不顯示空氣品質，特報照常", async () => {
    keys.weatherKeys.mockReturnValue({ forecast: true, airQuality: false });
    const text = await section();

    expect(cached.cachedStations).not.toHaveBeenCalled();
    expect(text).not.toContain("AQI");
    expect(text).toContain("目前沒有天氣特報");
  });
});

describe("我的城市：清單裡每個城市一張小卡片", () => {
  beforeEach(() => vi.useFakeTimers({ now: AFTERNOON, toFake: ["Date"] }));
  afterEach(() => vi.useRealTimers());

  const HOME = { key: "home", id: null, kind: "county", name: "臺北市", country: null, latitude: null, longitude: null, timezone: null } satisfies PlaceTab;
  const TOKYO = { key: "7", id: 7, kind: "world", name: "東京", country: "jp", latitude: 35.6895, longitude: 139.6917, timezone: "Asia/Tokyo" } satisfies PlaceTab;
  const SEOUL = { key: "8", id: 8, kind: "world", name: "首爾", country: "kr", latitude: 37.5665, longitude: 126.978, timezone: "Asia/Seoul" } satisfies PlaceTab;
  const tabs = [HOME, TOKYO, SEOUL];
  const cards = (page: string) => page.split("<li").slice(1).map((card) => textOf(`<li${card}`, { spaced: true }));

  beforeEach(() => {
    cached.cachedCountyWeek.mockResolvedValue([weekDay(TODAY, { weather: "陰短暫雨", high: 21, low: 17 })]);
    cached.cachedWorldWeek.mockImplementation(async (latitude: number) => ({ days: [weekDay(TODAY, latitude === TOKYO.latitude ? { weather: "晴", high: 18, low: 9 } : { weather: "雪", high: 3, low: -4 })], hours: [], utcOffsetSeconds: 0 }));
  });

  it("照清單的順序，首頁的縣市在最前面；每張都連到那個城市，跟城市膠囊同一個網址", async () => {
    const page = markup(await CityOverview({ tabs, selectedKey: "7" }));

    expect([...page.matchAll(/href="([^"]+)"/g)].map(([, href]) => href)).toEqual(["/weather?place=home", "/weather?place=7", "/weather?place=8"]);
  });

  it("正在看的城市標出來", async () => {
    const page = markup(await CityOverview({ tabs, selectedKey: "7" }));
    const current = [...page.matchAll(/<a [^>]*aria-current="page"[^>]*>/g)];

    expect(current).toHaveLength(1);
    expect(current[0][0]).toContain('href="/weather?place=7"');
  });

  it("每張寫那個城市今天的天氣與高低溫：台灣照縣市讀，國外照座標讀", async () => {
    const [taipei, tokyo, seoul] = cards(markup(await CityOverview({ tabs, selectedKey: "home" })));

    expect(cached.cachedCountyWeek).toHaveBeenCalledWith("臺北市");
    expect(cached.cachedWorldWeek).toHaveBeenCalledWith(TOKYO.latitude, TOKYO.longitude, "Asia/Tokyo");
    expect(cached.cachedWorldWeek).toHaveBeenCalledWith(SEOUL.latitude, SEOUL.longitude, "Asia/Seoul");
    expect(taipei).toContain("陰短暫雨");
    expect(taipei).toMatch(/21°.*17°/);
    expect(tokyo).toContain("晴");
    expect(tokyo).toMatch(/18°.*9°/);
    expect(seoul).toMatch(/3°.*-4°/);
  });

  it("讀不到預報的城市照樣列出，寫暫時無法讀取", async () => {
    cached.cachedWorldWeek.mockResolvedValue(null);
    const [, tokyo] = cards(markup(await CityOverview({ tabs, selectedKey: "home" })));

    expect(tokyo).toContain("東京");
    expect(tokyo).toContain("暫時無法讀取");
  });
});
