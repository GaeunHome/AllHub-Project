import { cacheLife } from "next/cache";
import { describe, expect, it, vi } from "vitest";
import { insertTestUsers, setupTestDb } from "@/dev/test-db";
import { stubWeatherEnv } from "@/dev/test-env";
import { captureErrorLog, tagged } from "@/dev/test-helpers";
import { cwaLocation, cwaResponse, cwaWarningLocation, cwaWarningResponse } from "../../dev/fixtures";

// 讀取標上讀到的表 外部資料標 weather:external 讀不到時用短效期
// 氣象署的回應只放一個時段的天氣現象
const FORECAST = cwaResponse(cwaLocation("臺北市", [{ start: "2026-10-16T18:00:00+08:00", end: "2026-10-17T06:00:00+08:00", Wx: "多雲" }]));

// env.ts 會記住第一次讀到的值 要在載入前設好
stubWeatherEnv();
const { cachedForecast, cachedSettings, cachedWarnings } = await import("../cached");
const { saveSettings } = await import("../settings");

const getDb = setupTestDb();

describe("天氣的快取", () => {
  it("縣市與兩種通知的開關每人一份（使用者 id 是參數），標 weather:settings", async () => {
    const [alice, bob] = await insertTestUsers(getDb());
    await saveSettings(alice, { county: "臺北市", rainAlert: false, warningAlert: true });

    expect(await cachedSettings(alice)).toEqual({ county: "臺北市", rainAlert: false, warningAlert: true });
    expect(await cachedSettings(bob)).toBeNull();
    expect([...new Set(tagged())]).toEqual(["weather:settings"]);
  });

  it("天氣警特報隨時會變：讀到或讀不到都幾分鐘（external）後再讀，標 weather:external；只回選的縣市，沒有特報是空陣列、讀不到是 null", async () => {
    const heavyRain = { phenomena: "大雨", significance: "特報", end: "2026-11-02 20:00:00" };
    vi.stubGlobal("fetch", vi.fn(async () => Response.json(cwaWarningResponse(cwaWarningLocation("臺北市", [heavyRain]), cwaWarningLocation("高雄市", [])))));

    expect(await cachedWarnings("臺北市")).toEqual([{ label: "大雨特報", severe: false, end: "2026-11-02T12:00:00.000Z" }]);
    expect(vi.mocked(cacheLife)).toHaveBeenLastCalledWith("external");
    expect(await cachedWarnings("高雄市")).toEqual([]);
    // 帶了 locationName 的回應裡沒有這個縣市 一樣當成沒有特報
    expect(await cachedWarnings("花蓮縣")).toEqual([]);

    vi.stubGlobal("fetch", vi.fn(async () => new Response("down", { status: 503 })));
    captureErrorLog();
    vi.mocked(cacheLife).mockClear();
    expect(await cachedWarnings("臺北市")).toBeNull();
    expect(vi.mocked(cacheLife)).toHaveBeenLastCalledWith("external");
    expect([...new Set(tagged())]).toEqual(["weather:external"]);
  });

  it("預報讀到時半小時（records），讀不到時幾分鐘（external）後再試；都標 weather:external", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json(FORECAST)));
    expect(await cachedForecast("臺北市")).not.toBeNull();
    expect(vi.mocked(cacheLife)).toHaveBeenLastCalledWith("records");

    vi.stubGlobal("fetch", vi.fn(async () => new Response("down", { status: 503 })));
    captureErrorLog();
    expect(await cachedForecast("臺北市")).toBeNull();
    expect(vi.mocked(cacheLife)).toHaveBeenLastCalledWith("external");
    expect([...new Set(tagged())]).toEqual(["weather:external"]);
  });
});
