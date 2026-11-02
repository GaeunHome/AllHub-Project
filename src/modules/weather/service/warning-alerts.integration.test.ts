import { asc, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from "vitest";
import { coreNotifications, coreRateLimits, coreUsers } from "@/core/db/schema";
import { fakeFetch } from "@/dev/fake-fetch";
import { insertTestUser, setupTestDb } from "@/dev/test-db";
import { stubWeatherEnv, TEST_WEATHER_ENV } from "@/dev/test-env";
import { captureErrorLog, loggedText, mocksOf } from "@/dev/test-helpers";
import { weatherSettings } from "../data/schema";
import { cwaWarningLocation, cwaWarningResponse } from "../dev/fixtures";

vi.mock("@/core/notify", { spy: true });

/** 台北 11/2 下午 2 點半 */
const AFTERNOON = new Date("2026-11-02T06:30:00Z");

// 照氣象署 W-C0033-001 的格式手寫 時間是台北時間
const HEAVY_RAIN = { phenomena: "大雨", significance: "特報", start: "2026-11-02 08:00:00", end: "2026-11-02 20:00:00" };
const TYPHOON = { phenomena: "海上陸上颱風", significance: "警報", start: "2026-11-02 05:30:00", end: "2026-11-04 08:30:00" };
const DENSE_FOG = { phenomena: "濃霧", significance: "特報", start: "2026-11-02 12:00:00" };

const RAINY = cwaWarningResponse(cwaWarningLocation("臺北市", [HEAVY_RAIN]), cwaWarningLocation("臺南市", [TYPHOON, DENSE_FOG]), cwaWarningLocation("高雄市", []));
const LONG_RAIN = cwaWarningResponse(cwaWarningLocation("臺北市", [{ ...HEAVY_RAIN, end: "2026-11-05 20:00:00" }]));

const getDb = setupTestDb();

// env.ts 會記住第一次讀到的值 每個測試重新載入
async function load() {
  const { notify } = mocksOf(await import("@/core/notify"), "notify");
  const { sendWarningAlerts } = await import("./warning-alerts");
  return { notify, sendWarningAlerts };
}

function serve(json: unknown) {
  const fetch = fakeFetch(() => Response.json(json));
  vi.stubGlobal("fetch", fetch.impl);
  return fetch;
}

async function member(name: string, county: string, alerts: { rainAlert?: boolean; warningAlert?: boolean } = {}): Promise<string> {
  const id = await insertTestUser(getDb(), name);
  await getDb().insert(weatherSettings).values({ userId: id, county, ...alerts });
  return id;
}

const notificationsOf = (userId: string) =>
  getDb()
    .select({ module: coreNotifications.module, kind: coreNotifications.kind, title: coreNotifications.title, body: coreNotifications.body, url: coreNotifications.url })
    .from(coreNotifications)
    .where(eq(coreNotifications.userId, userId));

const titlesOf = async (userId: string) => (await notificationsOf(userId)).map((notification) => notification.title).sort();

beforeEach(() => vi.resetModules());
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("天氣警特報通知（weather:warnings）", () => {
  it("同一縣市的每種特報各寄一則：標題是縣市加特報，有結束時間時內文寫出來，沒有就空，連到首頁；沒有特報的縣市不寄", async () => {
    stubWeatherEnv();
    const taipei = await member("taipei", "臺北市");
    const tainan = await member("tainan", "臺南市");
    const kaohsiung = await member("kaohsiung", "高雄市");
    serve(RAINY);
    const { sendWarningAlerts } = await load();

    expect(await sendWarningAlerts(AFTERNOON)).toBe("寄出 3 則天氣警特報通知");

    expect(await notificationsOf(taipei)).toEqual([{ module: "weather", kind: "warning", title: "臺北市 大雨特報", body: "到 11/2 20:00", url: "/" }]);
    expect(await notificationsOf(tainan)).toEqual(
      expect.arrayContaining([
        { module: "weather", kind: "warning", title: "臺南市 海上陸上颱風警報", body: "到 11/4 08:30", url: "/" },
        { module: "weather", kind: "warning", title: "臺南市 濃霧特報", body: "", url: "/" },
      ]),
    );
    expect(await notificationsOf(tainan)).toHaveLength(2);
    expect(await notificationsOf(kaohsiung)).toEqual([]);
  });

  it("同一縣市有警報也有特報時警報最後寫入：通知新的在上面，最急的排最上面", async () => {
    stubWeatherEnv();
    const tainan = await member("tainan", "臺南市");
    serve(RAINY);
    const { sendWarningAlerts } = await load();

    await sendWarningAlerts(AFTERNOON);

    const written = await getDb().select({ title: coreNotifications.title }).from(coreNotifications).where(eq(coreNotifications.userId, tainan)).orderBy(asc(coreNotifications.id));
    expect(written.map(({ title }) => title)).toEqual(["臺南市 濃霧特報", "臺南市 海上陸上颱風警報"]);
  });

  it("全台一次讀（不帶 locationName）最多等 15 秒，授權碼只在請求的網址裡；摘要只有數字，不寫縣市與使用者", async () => {
    stubWeatherEnv();
    await member("alice", "臺北市");
    await member("bob", "臺北市");
    await member("carol", "臺南市");
    const fetch = serve(RAINY);
    const timeout = vi.spyOn(AbortSignal, "timeout");
    onTestFinished(() => timeout.mockRestore());
    const { sendWarningAlerts } = await load();

    const result = await sendWarningAlerts(AFTERNOON);

    expect(result).toBe("寄出 4 則天氣警特報通知");
    expect(fetch.urls).toHaveLength(1);
    expect(new URL(fetch.urls[0]).pathname).toBe("/api/v1/rest/datastore/W-C0033-001");
    expect(new URL(fetch.urls[0]).searchParams.get("locationName")).toBeNull();
    expect(new URL(fetch.urls[0]).searchParams.get("Authorization")).toBe(TEST_WEATHER_ENV.CWA_API_KEY);
    expect(timeout).toHaveBeenCalledWith(15_000);
  });

  it("認領紀錄只存雜湊：看不出是誰、哪個縣市的哪種特報", async () => {
    stubWeatherEnv();
    await member("alice", "臺北市");
    serve(RAINY);
    const { sendWarningAlerts } = await load();

    await sendWarningAlerts(AFTERNOON);

    expect(await getDb().select({ scope: coreRateLimits.scope, keyHash: coreRateLimits.keyHash }).from(coreRateLimits)).toEqual([{ scope: "weather:warning", keyHash: expect.stringMatching(/^[0-9a-f]{64}$/) }]);
  });

  it("只寄給開著天氣警特報通知的人：關掉的不寄，帳號停用的人也不寄，同一個縣市開著的人照常；跟下雨通知的開關無關", async () => {
    stubWeatherEnv();
    const on = await member("alice", "臺北市");
    const rainOff = await member("dave", "臺北市", { rainAlert: false });
    const off = await member("bob", "臺北市", { warningAlert: false });
    const disabled = await member("carol", "臺北市");
    await getDb().update(coreUsers).set({ disabledAt: new Date() }).where(eq(coreUsers.id, disabled));
    serve(RAINY);
    const { sendWarningAlerts } = await load();

    expect(await sendWarningAlerts(AFTERNOON)).toBe("寄出 2 則天氣警特報通知");

    expect(await notificationsOf(on)).toHaveLength(1);
    expect(await notificationsOf(rainOff)).toHaveLength(1);
    expect(await notificationsOf(off)).toEqual([]);
    expect(await notificationsOf(disabled)).toEqual([]);
  });

  it("沒有人開著時不讀資料，也不寄", async () => {
    stubWeatherEnv();
    await member("alice", "臺北市", { warningAlert: false });
    const fetch = serve(RAINY);
    const { sendWarningAlerts } = await load();

    expect(await sendWarningAlerts(AFTERNOON)).toBe("沒有開著天氣警特報通知的人");
    expect(fetch.calls).toEqual([]);
  });

  it("沒有設定氣象署的授權碼：不對外請求，也不寄", async () => {
    vi.stubEnv("CWA_API_KEY", "");
    const alice = await member("alice", "臺北市");
    const fetch = serve(RAINY);
    const { sendWarningAlerts } = await load();

    expect(await sendWarningAlerts(AFTERNOON)).toBe("沒有設定氣象署的授權碼，略過");
    expect(fetch.calls).toEqual([]);
    expect(await notificationsOf(alice)).toEqual([]);
  });

  it("讀不到（例如 503 或格式不對）：這一輪略過、不寄，摘要說明，log 只記種類與狀態碼，不含授權碼", async () => {
    stubWeatherEnv();
    const alice = await member("alice", "臺北市");
    vi.stubGlobal("fetch", fakeFetch(() => new Response("Service Unavailable", { status: 503 })).impl);
    const { sendWarningAlerts } = await load();
    const log = captureErrorLog();

    expect(await sendWarningAlerts(AFTERNOON)).toBe("讀不到天氣警特報，這一輪略過");
    expect(await notificationsOf(alice)).toEqual([]);
    expect(loggedText(log)).toContain("503");
    expect(loggedText(log)).not.toContain(TEST_WEATHER_ENV.CWA_API_KEY);

    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    onTestFinished(() => warn.mockRestore());
    serve({ success: "false" });
    expect(await sendWarningAlerts(AFTERNOON)).toBe("讀不到天氣警特報，這一輪略過");
  });

  it("結束時間已過、氣象署還沒撤掉的特報不寄：這一輪沒有要通知的，還在生效的照寄", async () => {
    stubWeatherEnv();
    const id = await member("taipei", "臺北市");
    serve(cwaWarningResponse(cwaWarningLocation("臺北市", [{ ...HEAVY_RAIN, end: "2026-11-02 08:00:00" }, { ...DENSE_FOG, end: "2026-11-02 20:00:00" }])));
    const { sendWarningAlerts } = await load();

    await sendWarningAlerts(new Date("2026-11-02T02:00:00.000Z"));

    expect(await titlesOf(id)).toEqual(["臺北市 濃霧特報"]);
  });

  it("同一種特報有兩筆時看最晚結束的：08:00 那筆過了、20:00 那筆還在生效，早上 10 點照寄，內文寫 20:00", async () => {
    stubWeatherEnv();
    const id = await member("taipei", "臺北市");
    serve(cwaWarningResponse(cwaWarningLocation("臺北市", [{ ...DENSE_FOG, end: "2026-11-02 08:00:00" }, { ...DENSE_FOG, end: "2026-11-02 20:00:00" }])));
    const { sendWarningAlerts } = await load();

    expect(await sendWarningAlerts(new Date("2026-11-02T02:00:00.000Z"))).toBe("寄出 1 則天氣警特報通知");

    expect(await notificationsOf(id)).toEqual([{ module: "weather", kind: "warning", title: "臺北市 濃霧特報", body: "到 11/2 20:00", url: "/" }]);
  });

  it("全台都沒有特報，或回應裡沒有收件人的縣市：讀到了，只是沒有要寄的", async () => {
    stubWeatherEnv();
    const alice = await member("alice", "臺北市");
    serve(cwaWarningResponse(cwaWarningLocation("高雄市", [HEAVY_RAIN])));
    const { sendWarningAlerts } = await load();

    expect(await sendWarningAlerts(AFTERNOON)).toBe("目前沒有要通知的天氣警特報");
    serve(cwaWarningResponse());
    expect(await sendWarningAlerts(AFTERNOON)).toBe("目前沒有要通知的天氣警特報");
    expect(await notificationsOf(alice)).toEqual([]);
  });

  it("特報持續好幾天時每天早上提醒一次：同一天重跑不重複，23 點寄過之後隔天 00:30、05:30 不再寄，隔天 06:30 再寄一次，再隔一天早上也是", async () => {
    stubWeatherEnv();
    const alice = await member("alice", "臺北市");
    serve(LONG_RAIN);
    const { sendWarningAlerts } = await load();

    expect(await sendWarningAlerts(new Date("2026-11-02T15:00:00Z"))).toBe("寄出 1 則天氣警特報通知"); // 11/2 23:00
    expect(await sendWarningAlerts(new Date("2026-11-02T15:30:00Z"))).toBe("1 則今天已經提醒過"); // 11/2 23:30
    expect(await sendWarningAlerts(new Date("2026-11-02T16:30:00Z"))).toBe("1 則今天已經提醒過"); // 11/3 00:30
    expect(await sendWarningAlerts(new Date("2026-11-02T21:30:00Z"))).toBe("1 則今天已經提醒過"); // 11/3 05:30
    expect(await notificationsOf(alice)).toHaveLength(1);

    expect(await sendWarningAlerts(new Date("2026-11-02T22:30:00Z"))).toBe("寄出 1 則天氣警特報通知"); // 11/3 06:30
    expect(await sendWarningAlerts(new Date("2026-11-02T23:30:00Z"))).toBe("1 則今天已經提醒過"); // 11/3 07:30
    expect(await notificationsOf(alice)).toHaveLength(2);

    expect(await sendWarningAlerts(new Date("2026-11-03T22:30:00Z"))).toBe("寄出 1 則天氣警特報通知"); // 11/4 06:30
    expect(await notificationsOf(alice)).toHaveLength(3);
  });

  it("一天的分界剛好是台北 6 點：05:59 還算前一天，06:00 就是新的一天", async () => {
    stubWeatherEnv();
    const alice = await member("alice", "臺北市");
    serve(LONG_RAIN);
    const { sendWarningAlerts } = await load();

    expect(await sendWarningAlerts(new Date("2026-11-02T21:59:00Z"))).toBe("寄出 1 則天氣警特報通知"); // 11/3 05:59
    expect(await sendWarningAlerts(new Date("2026-11-02T22:00:00Z"))).toBe("寄出 1 則天氣警特報通知"); // 11/3 06:00
    expect(await notificationsOf(alice)).toHaveLength(2);
  });

  it("早上 6 點多第一次寄之後，一直到隔天 05:59 都算同一天：認領紀錄不能在這之前被清掉（清理是超過 24 小時）", async () => {
    stubWeatherEnv();
    const alice = await member("alice", "臺北市");
    serve(LONG_RAIN);
    const { sendWarningAlerts } = await load();

    expect(await sendWarningAlerts(new Date("2026-11-01T22:00:30Z"))).toBe("寄出 1 則天氣警特報通知"); // 11/2 06:00:30
    expect(await sendWarningAlerts(new Date("2026-11-02T21:59:00Z"))).toBe("1 則今天已經提醒過"); // 11/3 05:59
    expect(await notificationsOf(alice)).toHaveLength(1);
  });

  it("氣象署更新特報時開始或結束時間變了不重寄：同一縣市同一種特報一天一次", async () => {
    stubWeatherEnv();
    const alice = await member("alice", "臺北市");
    serve(RAINY);
    const { sendWarningAlerts } = await load();
    expect(await sendWarningAlerts(AFTERNOON)).toBe("寄出 1 則天氣警特報通知");

    serve(cwaWarningResponse(cwaWarningLocation("臺北市", [{ ...HEAVY_RAIN, start: "2026-11-02 14:00:00", end: "2026-11-03 02:00:00" }])));

    expect(await sendWarningAlerts(new Date(AFTERNOON.getTime() + 60 * 60_000))).toBe("1 則今天已經提醒過");
    expect(await notificationsOf(alice)).toHaveLength(1);
  });

  it("同一天新發布的另一種特報照寄，已經寄過的不重寄；搬到別的縣市後，那裡同一種特報也照寄", async () => {
    stubWeatherEnv();
    const alice = await member("alice", "臺北市");
    serve(RAINY);
    const { sendWarningAlerts } = await load();
    expect(await sendWarningAlerts(AFTERNOON)).toBe("寄出 1 則天氣警特報通知");

    serve(cwaWarningResponse(cwaWarningLocation("臺北市", [HEAVY_RAIN, DENSE_FOG]), cwaWarningLocation("新北市", [HEAVY_RAIN])));
    expect(await sendWarningAlerts(new Date(AFTERNOON.getTime() + 60 * 60_000))).toBe("寄出 1 則天氣警特報通知，1 則今天已經提醒過");
    expect(await titlesOf(alice)).toEqual(["臺北市 大雨特報", "臺北市 濃霧特報"]);

    await getDb().update(weatherSettings).set({ county: "新北市" }).where(eq(weatherSettings.userId, alice));
    expect(await sendWarningAlerts(new Date(AFTERNOON.getTime() + 120 * 60_000))).toBe("寄出 1 則天氣警特報通知");
    expect(await titlesOf(alice)).toEqual(["新北市 大雨特報", "臺北市 大雨特報", "臺北市 濃霧特報"]);
  });

  it("同一縣市的人一起寄：一種特報寄不出去時兩個人都算沒寄到，另一種特報照常，log 只記種類；下一輪只補寄沒收到的", async () => {
    stubWeatherEnv();
    const alice = await member("alice", "臺南市");
    const bob = await member("bob", "臺南市");
    serve(RAINY);
    const { notify, sendWarningAlerts } = await load();
    notify.mockRejectedValueOnce(new Error(`寫入失敗 ${TEST_WEATHER_ENV.CWA_API_KEY}`));
    const log = captureErrorLog();

    expect(await sendWarningAlerts(AFTERNOON)).toBe("寄出 2 則天氣警特報通知，2 則寄不出去");
    expect(await titlesOf(alice)).toHaveLength(1);
    expect(await titlesOf(bob)).toEqual(await titlesOf(alice));
    expect(loggedText(log)).toContain("Error");
    expect(loggedText(log)).not.toContain(TEST_WEATHER_ENV.CWA_API_KEY);

    expect(await sendWarningAlerts(new Date(AFTERNOON.getTime() + 60 * 60_000))).toBe("寄出 2 則天氣警特報通知，2 則今天已經提醒過");
    expect(await titlesOf(alice)).toEqual(["臺南市 海上陸上颱風警報", "臺南市 濃霧特報"]);
    expect(await titlesOf(bob)).toEqual(["臺南市 海上陸上颱風警報", "臺南市 濃霧特報"]);
  });

  it("一個縣市寄不出去時其他縣市照常；下一輪再寄給沒收到的", async () => {
    stubWeatherEnv();
    const alice = await member("alice", "臺北市");
    const bob = await member("bob", "新北市");
    serve(cwaWarningResponse(cwaWarningLocation("臺北市", [HEAVY_RAIN]), cwaWarningLocation("新北市", [HEAVY_RAIN])));
    const { notify, sendWarningAlerts } = await load();
    notify.mockRejectedValueOnce(new Error("寫入失敗"));
    captureErrorLog();

    expect(await sendWarningAlerts(AFTERNOON)).toBe("寄出 1 則天氣警特報通知，1 則寄不出去");
    expect([...(await notificationsOf(alice)), ...(await notificationsOf(bob))]).toHaveLength(1);

    expect(await sendWarningAlerts(new Date(AFTERNOON.getTime() + 60 * 60_000))).toBe("寄出 1 則天氣警特報通知，1 則今天已經提醒過");
    expect(await notificationsOf(alice)).toHaveLength(1);
    expect(await notificationsOf(bob)).toHaveLength(1);
  });

  it("同一種特報裡只放掉這次認領到的人：同一個縣市已經收過的人不動，之後也不會收到第二則", async () => {
    stubWeatherEnv();
    const alice = await member("alice", "臺北市");
    serve(RAINY);
    const { notify, sendWarningAlerts } = await load();
    expect(await sendWarningAlerts(AFTERNOON)).toBe("寄出 1 則天氣警特報通知");

    // bob 剛打開通知 這一輪寄不出去
    const bob = await member("bob", "臺北市");
    notify.mockRejectedValueOnce(new Error("寫入失敗"));
    captureErrorLog();
    expect(await sendWarningAlerts(new Date(AFTERNOON.getTime() + 30 * 60_000))).toBe("1 則今天已經提醒過，1 則寄不出去");

    expect(await sendWarningAlerts(new Date(AFTERNOON.getTime() + 60 * 60_000))).toBe("寄出 1 則天氣警特報通知，1 則今天已經提醒過");
    expect(await notificationsOf(alice)).toHaveLength(1);
    expect(await notificationsOf(bob)).toHaveLength(1);
  });
});
