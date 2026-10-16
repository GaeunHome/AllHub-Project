import { cacheLife } from "next/cache";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { insertTestUser, setupTestDb, type TestDb } from "@/dev/test-db";
import { stubCoreEnv } from "@/dev/test-env";
import { captureErrorLog, loggedText, resetNextCache, tagged } from "@/dev/test-helpers";
import type { ActCalendar } from "../lib/calendar";
import type { Endgame } from "../lib/endgame";
import type { Ledger } from "../lib/ledger";
import { starrailAccounts } from "../data/schema";

const hoyolab = vi.hoisted(() => ({
  fetchGameRoles: vi.fn(),
  fetchDailyNote: vi.fn(),
  fetchCheckinInfo: vi.fn(),
  signIn: vi.fn(),
  fetchCharacters: vi.fn(),
  fetchLedger: vi.fn(),
  fetchEndgame: vi.fn(),
  fetchProfile: vi.fn(),
  fetchActCalendar: vi.fn(),
}));
vi.mock("../lib/hoyolab", () => hoyolab);

stubCoreEnv();

const { cachedActCalendar, cachedEndgame, cachedLedger, cachedProfile } = await import("./cached");
const { linkAccount } = await import("./accounts");

const COOKIE = "ltoken_v2=v2_secret_token; ltuid_v2=42";
const ROLE = { uid: "900000001", nickname: "開拓者", region: "prod_official_cht", regionName: null, level: 70 };
const LEDGER: Ledger = {
  month: "202610",
  months: ["202609", "202610"],
  current: { jade: 4250, passes: 12 },
  today: { jade: 120, passes: 0 },
  sources: [{ id: "daily_reward", name: "每日獎勵", amount: 1800, percent: 42 }],
};
const AVATAR = "https://act-webstatic.hoyoverse.com/darkmatter/hkrpg/head/201102.png";
const CALENDAR: ActCalendar = {
  version: "3.7",
  challenges: [{ id: 1012, kind: "chaos", name: "永恆的信條", status: "ongoing", current: 24, total: 36, startsAt: Date.parse("2026-09-28T20:00:00Z"), endsAt: Date.parse("2026-10-26T20:00:00Z") }],
  events: [],
  warps: [],
};
const ENDGAME: Endgame = { mode: "chaos", hasData: true, name: "星海中的回聲", begin: "2026/10/6 04:00", end: "2026/10/20 03:00", stars: 36, maxFloor: "混沌回憶 12", battles: 14, floors: [] };

let testDb: TestDb;
setupTestDb((d) => (testDb = d));
let me: string;
let other: string;

const account = async () => (await testDb.select().from(starrailAccounts))[0];

beforeEach(async () => {
  me = await insertTestUser(testDb, "alice", { role: "owner" });
  other = await insertTestUser(testDb, "bob");
  for (const fn of Object.values(hoyolab)) fn.mockReset();
  hoyolab.fetchGameRoles.mockResolvedValue({ ok: true, data: [ROLE], raw: {} });
  hoyolab.fetchLedger.mockResolvedValue({ ok: true, data: { ledger: LEDGER, missing: [] }, raw: { echo: COOKIE } });
  hoyolab.fetchEndgame.mockResolvedValue({ ok: true, data: { endgame: ENDGAME, missing: [] }, raw: { echo: COOKIE } });
  hoyolab.fetchProfile.mockResolvedValue({ ok: true, data: { avatar: AVATAR, missing: [] }, raw: { echo: COOKIE } });
  hoyolab.fetchActCalendar.mockResolvedValue({ ok: true, data: { calendar: CALENDAR, missing: [] }, raw: { echo: COOKIE } });
  await linkAccount(me, COOKIE);
  resetNextCache();
});

describe("cachedLedger：開拓月曆，參數是帳號 id 與月份", () => {
  it("在快取函式裡才解密 cookie_回傳整理好的月曆_沒有 cookie_標 starrail:accounts、30 分鐘效期", async () => {
    const result = await cachedLedger(me, (await account()).id, "202610");

    expect(hoyolab.fetchLedger).toHaveBeenCalledWith(COOKIE, "900000001", "prod_official_cht", "202610");
    expect(result).toMatchObject({ ok: true, ledger: LEDGER, cookieInvalid: false });
    expect(JSON.stringify(result)).not.toContain("v2_secret_token");
    expect(tagged()).toEqual(["starrail:accounts"]);
    expect(cacheLife).toHaveBeenCalledWith("records");
  });

  it("失敗_中文訊息、短效期；log 只記 retcode", async () => {
    const log = captureErrorLog();
    hoyolab.fetchLedger.mockResolvedValue({ ok: false, retcode: -110, message: "HoYoLAB 說查詢太頻繁，過幾分鐘再試（-110）", cookieInvalid: false, raw: { secret: "raw-body" } });

    expect(await cachedLedger(me, (await account()).id, "202610")).toMatchObject({ ok: false, message: expect.stringContaining("太頻繁") });
    expect(cacheLife).toHaveBeenCalledWith("external");
    expect(loggedText(log)).toContain("-110");
    expect(loggedText(log)).not.toContain("raw-body");
  });
});

describe("cachedEndgame：終局戰績，參數是帳號 id、模式與本期／上期", () => {
  it("回傳整理好的戰績_沒有 cookie_標 starrail:accounts、30 分鐘效期", async () => {
    const result = await cachedEndgame(me, (await account()).id, "chaos", "previous");

    expect(hoyolab.fetchEndgame).toHaveBeenCalledWith(COOKIE, "900000001", "prod_official_cht", "chaos", "previous");
    expect(result).toMatchObject({ ok: true, endgame: ENDGAME, cookieInvalid: false });
    expect(JSON.stringify(result)).not.toContain("v2_secret_token");
    expect(tagged()).toEqual(["starrail:accounts"]);
    expect(cacheLife).toHaveBeenCalledWith("records");
  });

  it("格式跟預期不同_照常回傳_log 只記欄位名稱", async () => {
    const log = captureErrorLog();
    hoyolab.fetchEndgame.mockResolvedValue({ ok: true, data: { endgame: { ...ENDGAME, name: null }, missing: ["groups[].name_mi18n"] }, raw: { name: "原文期數" } });

    const result = await cachedEndgame(me, (await account()).id, "fiction", "current");

    expect(result.ok && result.endgame.name).toBeNull();
    expect(loggedText(log)).toContain("groups[].name_mi18n");
    expect(loggedText(log)).not.toContain("原文期數");
  });

  it("cookie 失效_回報在結果裡，不寫帳號的失效標記（只由即時便箋與排程決定）", async () => {
    hoyolab.fetchEndgame.mockResolvedValue({ ok: false, retcode: -100, message: "cookie 已失效", cookieInvalid: true, raw: {} });

    expect(await cachedEndgame(me, (await account()).id, "shadow", "current")).toMatchObject({ ok: false, cookieInvalid: true });
    expect((await account()).cookieInvalid).toBe(false);
  });
});

describe("cachedProfile：遊戲頭像，參數是帳號 id", () => {
  it("在快取函式裡才解密 cookie_只回頭像網址（沒有 cookie）_標 starrail:accounts、一天的效期", async () => {
    const result = await cachedProfile(me, (await account()).id);

    expect(hoyolab.fetchProfile).toHaveBeenCalledWith(COOKIE, "900000001", "prod_official_cht");
    expect(result).toBe(AVATAR);
    expect(tagged()).toEqual(["starrail:accounts"]);
    expect(cacheLife).toHaveBeenCalledWith("avatar");
    expect(cacheLife).toHaveBeenCalledTimes(1);
  });

  it("讀不到（HoYoLAB 出錯）_回 null、短效期幾分鐘後再試；log 只記 retcode", async () => {
    const log = captureErrorLog();
    hoyolab.fetchProfile.mockResolvedValue({ ok: false, retcode: -110, message: "HoYoLAB 說查詢太頻繁，過幾分鐘再試（-110）", cookieInvalid: false, raw: { secret: "raw-body" } });

    expect(await cachedProfile(me, (await account()).id)).toBeNull();
    expect(cacheLife).toHaveBeenCalledWith("external");
    expect(cacheLife).not.toHaveBeenCalledWith("avatar");
    expect(loggedText(log)).toContain("-110");
    expect(loggedText(log)).not.toContain("raw-body");
  });

  it("回應裡沒有頭像_回 null、短效期", async () => {
    captureErrorLog();
    hoyolab.fetchProfile.mockResolvedValue({ ok: true, data: { avatar: null, missing: ["cur_head_icon_url"] }, raw: {} });

    expect(await cachedProfile(me, (await account()).id)).toBeNull();
    expect(cacheLife).toHaveBeenCalledWith("external");
  });

  it("HoYoLAB 說 cookie 失效_只回 null，不動帳號的失效標記", async () => {
    captureErrorLog();
    hoyolab.fetchProfile.mockResolvedValue({ ok: false, retcode: -100, message: "cookie 已失效", cookieInvalid: true, raw: {} });

    expect(await cachedProfile(me, (await account()).id)).toBeNull();
    expect((await account()).cookieInvalid).toBe(false);
  });
});

describe("cachedActCalendar：活動日曆，參數是帳號 id", () => {
  it("在快取函式裡才解密 cookie_回傳整理好的日曆（沒有 cookie）_標 starrail:accounts、30 分鐘效期", async () => {
    const result = await cachedActCalendar(me, (await account()).id);

    expect(hoyolab.fetchActCalendar).toHaveBeenCalledWith(COOKIE, "900000001", "prod_official_cht");
    expect(result).toMatchObject({ ok: true, calendar: CALENDAR, cookieInvalid: false });
    expect(JSON.stringify(result)).not.toContain("v2_secret_token");
    expect(tagged()).toEqual(["starrail:accounts"]);
    expect(cacheLife).toHaveBeenCalledWith("records");
    expect(cacheLife).not.toHaveBeenCalledWith("external");
  });

  it("讀不到_中文訊息、短效期幾分鐘後再試；log 只記 retcode；cookie 失效也不動帳號的標記", async () => {
    const log = captureErrorLog();
    hoyolab.fetchActCalendar.mockResolvedValue({ ok: false, retcode: -100, message: "cookie 已失效", cookieInvalid: true, raw: { secret: "raw-body" } });

    expect(await cachedActCalendar(me, (await account()).id)).toMatchObject({ ok: false, message: "cookie 已失效" });
    expect(cacheLife).toHaveBeenCalledWith("external");
    expect(cacheLife).not.toHaveBeenCalledWith("records");
    expect(loggedText(log)).toContain("-100");
    expect(loggedText(log)).not.toContain("raw-body");
    expect((await account()).cookieInvalid).toBe(false);
  });
});

describe("擁有權：快取函式的參數有使用者 id，別人的帳號 id 當作不存在", () => {
  it("用別人的帳號 id 讀活動日曆_回找不到，不呼叫 HoYoLAB", async () => {
    expect(await cachedActCalendar(other, (await account()).id)).toMatchObject({ ok: false, cookieInvalid: false, message: "找不到這個帳號，請重新整理頁面" });
    expect(hoyolab.fetchActCalendar).not.toHaveBeenCalled();
  });

  it("用別人的帳號 id 讀開拓月曆與終局戰績_回找不到，不呼叫 HoYoLAB", async () => {
    const { id } = await account();

    expect(await cachedLedger(other, id, "202610")).toMatchObject({ ok: false, cookieInvalid: false, message: "找不到這個帳號，請重新整理頁面" });
    expect(await cachedEndgame(other, id, "chaos", "current")).toMatchObject({ ok: false, cookieInvalid: false });
    expect(hoyolab.fetchLedger).not.toHaveBeenCalled();
    expect(hoyolab.fetchEndgame).not.toHaveBeenCalled();
  });

  it("用別人的帳號 id 讀遊戲頭像_回 null，不呼叫 HoYoLAB", async () => {
    expect(await cachedProfile(other, (await account()).id)).toBeNull();
    expect(hoyolab.fetchProfile).not.toHaveBeenCalled();
  });
});
