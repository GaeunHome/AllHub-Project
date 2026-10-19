import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { coreNotifications, coreUsers } from "@/core/db/schema";
import { fakeFetch } from "@/dev/fake-fetch";
import { insertTestUser, setupTestDb } from "@/dev/test-db";
import { stubWeatherEnv, TEST_WEATHER_ENV } from "@/dev/test-env";
import { captureErrorLog, loggedText, mocksOf } from "@/dev/test-helpers";
import { weatherSettings } from "../data/schema";
import { cwaLocation, cwaResponse } from "../dev/fixtures";

vi.mock("@/core/notify", { spy: true });

// 排程在 UTC 22 點跑 這裡是台北 10/19 早上 6 點 10 分
const MORNING = new Date("2026-10-18T22:10:00Z");
const MINUTE = 60_000;
const DAY = 86_400_000;

// 照氣象署 F-C0032-001 的格式手寫 時段是台北時間
const DAWN = ["2026-10-19T00:00:00+08:00", "2026-10-19T06:00:00+08:00"] as const;
const TODAY = ["2026-10-19T06:00:00+08:00", "2026-10-19T18:00:00+08:00"] as const;
const TONIGHT = ["2026-10-19T18:00:00+08:00", "2026-10-20T06:00:00+08:00"] as const;
const TOMORROW = ["2026-10-20T06:00:00+08:00", "2026-10-20T18:00:00+08:00"] as const;
const TOMORROW_NIGHT = ["2026-10-20T18:00:00+08:00", "2026-10-21T06:00:00+08:00"] as const;

// 每一段都是陰短暫雨 只有降雨機率不同
const location = (county: string, periods: Array<[readonly [string, string], string]>) =>
  cwaLocation(county, periods.map(([[start, end], pop]) => ({ start, end, Wx: "陰短暫雨", PoP: pop, MinT: "21", CI: "舒適", MaxT: "26" })));
const forecast = cwaResponse;

// 早上看今天白天與今晚 臺北市白天 70 要帶傘 花蓮縣白天讀不到 晚上剛好 50 也要帶傘
// 高雄市最高 40 只是帶把折傘 臺中市凌晨的 90 已經過了 明天白天的 80 也不算
const RAINY_MORNING = forecast(
  location("臺北市", [[TODAY, "70"], [TONIGHT, "40"], [TOMORROW, "20"]]),
  location("花蓮縣", [[TODAY, ""], [TONIGHT, "50"], [TOMORROW, "10"]]),
  location("高雄市", [[TODAY, "40"], [TONIGHT, "30"], [TOMORROW, "80"]]),
  location("臺中市", [[DAWN, "90"], [TODAY, "20"], [TONIGHT, "10"], [TOMORROW, "80"]]),
);

const getDb = setupTestDb();

// env.ts 會記住第一次讀到的值 每個測試重新載入
async function load() {
  const { notify } = mocksOf(await import("@/core/notify"), "notify");
  const { sendRainAlerts } = await import("./rain-alerts");
  return { notify, sendRainAlerts };
}

function serve(json: unknown) {
  const fetch = fakeFetch(() => Response.json(json));
  vi.stubGlobal("fetch", fetch.impl);
  return fetch;
}

async function member(name: string, county: string, rainAlert = true): Promise<string> {
  const id = await insertTestUser(getDb(), name);
  await getDb().insert(weatherSettings).values({ userId: id, county, rainAlert });
  return id;
}

const notificationsOf = (userId: string) =>
  getDb()
    .select({ module: coreNotifications.module, kind: coreNotifications.kind, title: coreNotifications.title, body: coreNotifications.body, url: coreNotifications.url })
    .from(coreNotifications)
    .where(eq(coreNotifications.userId, userId));

beforeEach(() => vi.resetModules());
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("早上會下雨時提醒帶傘（weather:rain）", () => {
  it("今天白天或今晚的降雨機率 50% 以上才寄，寫出縣市與兩段的降雨機率（第二段只寫「今晚 40%」）、連到首頁；只帶傘的門檻以下、已經過去或明天的時段都不算", async () => {
    stubWeatherEnv();
    const taipei = await member("taipei", "臺北市");
    const hualien = await member("hualien", "花蓮縣");
    const kaohsiung = await member("kaohsiung", "高雄市");
    const taichung = await member("taichung", "臺中市");
    serve(RAINY_MORNING);
    const { sendRainAlerts } = await load();

    expect(await sendRainAlerts(MORNING)).toBe("寄出 2 則下雨提醒");

    expect(await notificationsOf(taipei)).toEqual([{ module: "weather", kind: "rain", title: "記得帶傘", body: "臺北市 今天白天降雨機率 70%、今晚 40%", url: "/" }]);
    expect(await notificationsOf(hualien)).toEqual([{ module: "weather", kind: "rain", title: "記得帶傘", body: "花蓮縣 今晚降雨機率 50%", url: "/" }]);
    expect(await notificationsOf(kaohsiung)).toEqual([]);
    expect(await notificationsOf(taichung)).toEqual([]);
  });

  it("全台的預報一次讀（不帶 locationName），授權碼只在請求的網址裡；摘要不寫縣市與使用者", async () => {
    stubWeatherEnv();
    await member("alice", "臺北市");
    await member("bob", "臺北市");
    await member("carol", "花蓮縣");
    const fetch = serve(RAINY_MORNING);
    const { sendRainAlerts } = await load();

    const result = await sendRainAlerts(MORNING);

    expect(result).toBe("寄出 3 則下雨提醒");
    expect(fetch.urls).toHaveLength(1);
    expect(new URL(fetch.urls[0]).searchParams.get("locationName")).toBeNull();
    expect(new URL(fetch.urls[0]).searchParams.get("Authorization")).toBe(TEST_WEATHER_ENV.CWA_API_KEY);
  });

  it("關掉下雨通知的人不寄；帳號停用的人也不寄，同一個縣市開著的人照常", async () => {
    stubWeatherEnv();
    const on = await member("alice", "臺北市");
    const off = await member("bob", "臺北市", false);
    const disabled = await member("carol", "臺北市");
    await getDb().update(coreUsers).set({ disabledAt: new Date() }).where(eq(coreUsers.id, disabled));
    serve(RAINY_MORNING);
    const { sendRainAlerts } = await load();

    expect(await sendRainAlerts(MORNING)).toBe("寄出 1 則下雨提醒");

    expect(await notificationsOf(on)).toHaveLength(1);
    expect(await notificationsOf(off)).toEqual([]);
    expect(await notificationsOf(disabled)).toEqual([]);
  });

  it("沒有人開著下雨通知時不讀預報", async () => {
    stubWeatherEnv();
    await member("alice", "臺北市", false);
    const fetch = serve(RAINY_MORNING);
    const { sendRainAlerts } = await load();

    expect(await sendRainAlerts(MORNING)).toBe("沒有開著下雨提醒的人");
    expect(fetch.calls).toEqual([]);
  });

  it("每人每天（台北的日期）只寄一次：同一天再跑（例如排程重送、UTC 已經換日的早上 8 點半）不重寄，隔天早上會下雨時照常寄", async () => {
    stubWeatherEnv();
    const alice = await member("alice", "臺北市");
    serve(RAINY_MORNING);
    const { sendRainAlerts } = await load();

    expect(await sendRainAlerts(MORNING)).toBe("寄出 1 則下雨提醒");
    expect(await sendRainAlerts(new Date(MORNING.getTime() + 30 * MINUTE))).toBe("1 人今天已經提醒過");
    // 台北 10/19 08:30 UTC 已經是 10/19 跟早上 6 點那次的 UTC 日期不同
    expect(await sendRainAlerts(new Date("2026-10-19T00:30:00Z"))).toBe("1 人今天已經提醒過");
    expect(await notificationsOf(alice)).toHaveLength(1);

    serve(forecast(location("臺北市", [[TOMORROW, "60"], [TOMORROW_NIGHT, "20"], [["2026-10-21T06:00:00+08:00", "2026-10-21T18:00:00+08:00"], "10"]])));
    expect(await sendRainAlerts(new Date(MORNING.getTime() + DAY))).toBe("寄出 1 則下雨提醒");
    expect((await notificationsOf(alice)).map((n) => n.body)).toEqual(["臺北市 今天白天降雨機率 70%、今晚 40%", "臺北市 今天白天降雨機率 60%、今晚 20%"]);
  });

  it("寄不出去時放掉認領、log 只記錯誤種類，其他縣市照常；下一次排程再寄給沒收到的人", async () => {
    stubWeatherEnv();
    const alice = await member("alice", "臺北市");
    const bob = await member("bob", "花蓮縣");
    serve(RAINY_MORNING);
    const { notify, sendRainAlerts } = await load();
    notify.mockRejectedValueOnce(new Error(`寫入失敗 ${TEST_WEATHER_ENV.CWA_API_KEY}`));
    const log = captureErrorLog();

    expect(await sendRainAlerts(MORNING)).toBe("寄出 1 則下雨提醒，1 則寄不出去");
    const received = [...(await notificationsOf(alice)), ...(await notificationsOf(bob))];
    expect(received).toHaveLength(1);
    expect(loggedText(log)).toContain("Error");
    expect(loggedText(log)).not.toContain(TEST_WEATHER_ENV.CWA_API_KEY);

    expect(await sendRainAlerts(new Date(MORNING.getTime() + 30 * MINUTE))).toBe("寄出 1 則下雨提醒，1 人今天已經提醒過");
    expect(await notificationsOf(alice)).toHaveLength(1);
    expect(await notificationsOf(bob)).toHaveLength(1);
  });

  it("寄不出去時只放掉這一次認領到的人：同一個縣市今天已經收過的人不動，之後也不會收到第二則", async () => {
    stubWeatherEnv();
    const alice = await member("alice", "臺北市");
    serve(RAINY_MORNING);
    const { notify, sendRainAlerts } = await load();
    expect(await sendRainAlerts(MORNING)).toBe("寄出 1 則下雨提醒");

    // bob 剛打開下雨通知 這一輪寄不出去
    const bob = await member("bob", "臺北市");
    notify.mockRejectedValueOnce(new Error("寫入失敗"));
    captureErrorLog();
    expect(await sendRainAlerts(new Date(MORNING.getTime() + 30 * MINUTE))).toBe("1 人今天已經提醒過，1 則寄不出去");

    expect(await sendRainAlerts(new Date(MORNING.getTime() + 60 * MINUTE))).toBe("寄出 1 則下雨提醒，1 人今天已經提醒過");
    expect(await notificationsOf(alice)).toHaveLength(1);
    expect(await notificationsOf(bob)).toHaveLength(1);
  });

  it("沒有設定氣象署的授權碼：不讀資料庫以外的東西，也不寄", async () => {
    vi.stubEnv("CWA_API_KEY", "");
    const alice = await member("alice", "臺北市");
    const fetch = serve(RAINY_MORNING);
    const { sendRainAlerts } = await load();

    expect(await sendRainAlerts(MORNING)).toBe("沒有設定氣象署的授權碼，略過");
    expect(fetch.calls).toEqual([]);
    expect(await notificationsOf(alice)).toEqual([]);
  });

  it("讀不到預報（例如 503）：今天略過、不寄，log 只記種類與狀態碼，不含授權碼", async () => {
    stubWeatherEnv();
    const alice = await member("alice", "臺北市");
    vi.stubGlobal("fetch", fakeFetch(() => new Response("Service Unavailable", { status: 503 })).impl);
    const { sendRainAlerts } = await load();
    const log = captureErrorLog();

    expect(await sendRainAlerts(MORNING)).toBe("讀不到天氣預報，今天略過");
    expect(await notificationsOf(alice)).toEqual([]);
    expect(loggedText(log)).toContain("503");
    expect(loggedText(log)).not.toContain(TEST_WEATHER_ENV.CWA_API_KEY);
  });

  it("回應裡少了某個縣市：略過那個縣市，其他縣市照常；警告不寫縣市（看不出誰住哪裡）", async () => {
    stubWeatherEnv();
    const taipei = await member("taipei", "臺北市");
    const kinmen = await member("kinmen", "金門縣");
    serve(RAINY_MORNING);
    const { sendRainAlerts } = await load();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    expect(await sendRainAlerts(MORNING)).toBe("寄出 1 則下雨提醒，1 個縣市讀不到預報");
    expect(await notificationsOf(taipei)).toHaveLength(1);
    expect(await notificationsOf(kinmen)).toEqual([]);
    for (const county of ["臺北市", "金門縣"]) expect(loggedText(warn)).not.toContain(county);
  });
});
