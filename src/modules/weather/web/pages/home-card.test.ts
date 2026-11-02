import type { ReactElement } from "react";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { OTHER_SESSION, TEST_SESSION, requireSession } from "@/dev/session-stub";
import { stubWeatherEnv } from "@/dev/test-env";
import { markup, mocksOf, textOf } from "@/dev/test-helpers";
import { forecastWith as forecast } from "../../dev/fixtures";

stubWeatherEnv();
vi.mock("@/core/auth", () => import("@/dev/session-stub"));
vi.mock("../../service/cached", { spy: true });
vi.mock("../../service/weather", { spy: true });

const keys = mocksOf(await import("../../service/weather"), "weatherKeys");
const cached = mocksOf(await import("../../service/cached"), "cachedSettings", "cachedForecast", "cachedStations", "cachedWarnings");
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
  cached.cachedSettings.mockReset().mockResolvedValue({ county: "臺北市", rainAlert: true, warningAlert: true });
  cached.cachedForecast.mockReset().mockResolvedValue(forecastWith([70, 40]));
  cached.cachedStations.mockReset().mockResolvedValue([]);
  cached.cachedWarnings.mockReset().mockResolvedValue([]);
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

describe("首頁天氣卡片的警特報標籤", () => {
  // 台北 10/19 20:00 跟 NOW 同一天 10/20 08:00 是隔天
  const HEAVY_RAIN = { label: "大雨特報", severe: false, end: "2026-10-19T12:00:00.000Z" };
  const TYPHOON = { label: "海上陸上颱風警報", severe: true, end: "2026-10-20T00:00:00.000Z" };

  it("讀選的縣市；有特報時標籤在卡片內容最上面，照讀到的順序，文字是特報加結束時間", async () => {
    cached.cachedSettings.mockResolvedValue({ county: "花蓮縣", rainAlert: true, warningAlert: true });
    cached.cachedWarnings.mockResolvedValue([TYPHOON, HEAVY_RAIN]);

    const text = textOf(await html());

    expect(cached.cachedWarnings).toHaveBeenCalledWith("花蓮縣");
    expect(text).toContain("海上陸上颱風警報 到 10/20 08:00");
    expect(text).toContain("大雨特報 到 20:00");
    expect(text.indexOf("海上陸上颱風警報")).toBeLessThan(text.indexOf("大雨特報"));
    expect(text.indexOf("大雨特報")).toBeLessThan(text.indexOf("花蓮縣"));
  });

  it("關掉通知的人一樣看得到標籤：開關只管通知", async () => {
    cached.cachedSettings.mockResolvedValue({ county: "臺北市", rainAlert: false, warningAlert: false });
    cached.cachedWarnings.mockResolvedValue([HEAVY_RAIN]);

    expect(textOf(await html())).toContain("大雨特報");
  });

  it("沒有特報時不多一排：畫面跟沒有這個功能時一樣", async () => {
    const without = await html();

    cached.cachedWarnings.mockResolvedValue([HEAVY_RAIN]);
    const withWarning = await html();

    expect(withWarning).not.toBe(without);
    cached.cachedWarnings.mockResolvedValue(null);
    expect(await html()).toBe(without);
  });

  it("讀不到特報時不顯示，預報照常", async () => {
    cached.cachedWarnings.mockResolvedValue(null);

    const text = textOf(await html());

    expect(text).toContain("陰短暫雨");
    expect(text).toContain("記得帶傘");
    expect(text).not.toContain("特報");
  });

  it("讀不到預報時標籤照樣顯示", async () => {
    cached.cachedForecast.mockResolvedValue(null);
    cached.cachedWarnings.mockResolvedValue([HEAVY_RAIN]);

    const text = textOf(await html());

    expect(text).toContain("大雨特報 到 20:00");
    expect(text).toContain("臺北市的天氣預報暫時讀不到");
  });

  it("超長的標籤不撐破卡片（36 字實測超出卡片 300px）：這排標籤最寬等於卡片內容，放不下時在標籤內換行，結束時間看得到", async () => {
    cached.cachedWarnings.mockResolvedValue([{ ...TYPHOON, label: `${"超長的海上陸上颱風與大雨豪雨併發".repeat(2)}警報` }]);

    const page = await html();
    const chip = page.match(/<span class="([^"]*\bchip\b[^"]*)"/)?.[1].split(" ") ?? [];

    // .chip 預設不換行 換行要靠這兩個
    expect(chip).toEqual(expect.arrayContaining(["max-w-full", "whitespace-normal"]));
    expect(textOf(page)).toContain("到 10/20 08:00");
  });

  it("還沒選縣市或沒有授權碼時不讀特報", async () => {
    cached.cachedSettings.mockResolvedValue(null);
    await html();
    expect(cached.cachedWarnings).not.toHaveBeenCalled();

    cached.cachedSettings.mockResolvedValue({ county: "臺北市", rainAlert: true, warningAlert: true });
    keys.weatherKeys.mockReturnValueOnce({ forecast: false, airQuality: true });
    expect(textOf(await html())).toContain("還沒設定氣象署的授權碼");
    expect(cached.cachedWarnings).not.toHaveBeenCalled();
  });
});
