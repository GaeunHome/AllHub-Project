import { cacheLife } from "next/cache";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { insertTestUser, setupTestDb, type TestDb } from "@/dev/test-db";
import { stubCoreEnv } from "@/dev/test-env";
import { captureErrorLog, loggedText, resetNextCache, tagged } from "@/dev/test-helpers";
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
}));
vi.mock("../lib/hoyolab", () => hoyolab);

stubCoreEnv();

const { cachedEndgame, cachedLedger } = await import("./cached");
const { linkAccount } = await import("./accounts");

const COOKIE = "ltoken_v2=v2_secret_token; ltuid_v2=42";
const ROLE = { uid: "900000001", nickname: "開拓者", region: "prod_official_cht", regionName: null, level: 70 };
const LEDGER: Ledger = {
  month: "202610",
  months: ["202609", "202610"],
  current: { jade: 4250, passes: 12 },
  last: { jade: 6120, passes: 9 },
  jadeRate: -31,
  passRate: 33,
  today: { jade: 120, passes: 0 },
  sources: [{ id: "daily_reward", name: "每日獎勵", amount: 1800, percent: 42 }],
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

  it("cookie 失效_回報給呼叫端（頁面在回應後寫回）", async () => {
    hoyolab.fetchEndgame.mockResolvedValue({ ok: false, retcode: -100, message: "cookie 已失效", cookieInvalid: true, raw: {} });

    expect(await cachedEndgame(me, (await account()).id, "shadow", "current")).toMatchObject({ ok: false, cookieInvalid: true });
  });
});

describe("擁有權：快取函式的參數有使用者 id，別人的帳號 id 當作不存在", () => {
  it("用別人的帳號 id 讀開拓月曆與終局戰績_回找不到，不呼叫 HoYoLAB", async () => {
    const { id } = await account();

    expect(await cachedLedger(other, id, "202610")).toMatchObject({ ok: false, cookieInvalid: false, message: "找不到這個帳號，請重新整理頁面" });
    expect(await cachedEndgame(other, id, "chaos", "current")).toMatchObject({ ok: false, cookieInvalid: false });
    expect(hoyolab.fetchLedger).not.toHaveBeenCalled();
    expect(hoyolab.fetchEndgame).not.toHaveBeenCalled();
  });
});
