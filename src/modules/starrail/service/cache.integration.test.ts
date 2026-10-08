import { eq } from "drizzle-orm";
import { cacheLife, revalidateTag } from "next/cache";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { setupTestDb, type TestDb } from "@/dev/test-db";
import { stubCoreEnv } from "@/dev/test-env";
import { resetNextCache, tagged } from "@/dev/test-helpers";
import type { DailyNote } from "../lib/responses";
import { starrailAccounts, starrailCheckinLogs } from "../data/schema";

const hoyolab = vi.hoisted(() => ({ fetchGameRoles: vi.fn(), fetchDailyNote: vi.fn(), fetchCheckinInfo: vi.fn(), signIn: vi.fn() }));
vi.mock("../lib/hoyolab", () => hoyolab);

stubCoreEnv();

const { cachedAccounts, cachedDailyNote, cachedRecentCheckins } = await import("./cached");
const { linkAccount, syncCookieInvalid } = await import("./accounts");

const COOKIE = "ltoken_v2=v2_secret_token; ltuid_v2=42";
const ROLE = { uid: "900000001", nickname: "開拓者", region: "prod_official_cht", regionName: null, level: 70 };
const NOTE: DailyNote = {
  stamina: 231, maxStamina: 300, staminaRecoverSeconds: 24_840, reserveStamina: 1200,
  expeditionsAccepted: 4, expeditionsTotal: 4, trainScore: 300, maxTrainScore: 500,
  rogueScore: 8000, maxRogueScore: 14000, cocoonRemaining: 2, cocoonLimit: 3,
};

let testDb: TestDb;
setupTestDb((d) => (testDb = d));

const account = async () => (await testDb.select().from(starrailAccounts))[0];

beforeEach(async () => {
  for (const fn of Object.values(hoyolab)) fn.mockReset();
  hoyolab.fetchGameRoles.mockResolvedValue({ ok: true, data: [ROLE], raw: {} });
  hoyolab.fetchDailyNote.mockResolvedValue({ ok: true, data: NOTE, raw: { cookie_echo: COOKIE } });
  await linkAccount(COOKIE);
  resetNextCache();
});

describe("星穹鐵道的快取讀取", () => {
  it("cachedAccounts_starrail:accounts_快取裡沒有 cookie 原文也沒有密文", async () => {
    const { cookieEncrypted } = await account();

    const [view] = await cachedAccounts();

    expect(view).toMatchObject({ uid: "900000001", nickname: "開拓者", level: 70, cookieInvalid: false, staminaAlertThreshold: null });
    expect(view).not.toHaveProperty("cookieEncrypted");
    expect(JSON.stringify(view)).not.toContain("v2_secret_token");
    expect(JSON.stringify(view)).not.toContain(cookieEncrypted);
    expect(tagged()).toEqual(["starrail:accounts"]);
    expect(cacheLife).toHaveBeenCalledWith("db");
  });

  it("cachedRecentCheckins_讀了紀錄與角色名稱兩張表_兩個 tag 都標", async () => {
    await testDb.insert(starrailCheckinLogs).values({ accountId: (await account()).id, result: "success", message: "簽到成功" });

    const [log] = await cachedRecentCheckins();

    expect(log).toMatchObject({ nickname: "開拓者", log: { result: "success" } });
    expect(tagged()).toEqual(["starrail:accounts", "starrail:checkins"]);
  });
});

describe("cachedDailyNote：即時便箋短效期快取，參數只有帳號 id", () => {
  it("在快取函式裡才解密 cookie_回傳值沒有 cookie_用 external 效期", async () => {
    const { id } = await account();

    const result = await cachedDailyNote(id);

    expect(hoyolab.fetchDailyNote).toHaveBeenCalledWith(COOKIE, "900000001", "prod_official_cht");
    expect(result).toMatchObject({ ok: true, note: NOTE, cookieInvalid: false });
    expect(result.fetchedAt).toBeInstanceOf(Date);
    expect(JSON.stringify(result)).not.toContain("v2_secret_token");
    expect(tagged()).toEqual(["starrail:accounts"]);
    expect(cacheLife).toHaveBeenCalledWith("external");
  });

  it("HoYoLAB 說 cookie 失效_回報給呼叫端_快取函式裡不寫資料庫", async () => {
    hoyolab.fetchDailyNote.mockResolvedValue({ ok: false, retcode: -100, message: "cookie 已失效", cookieInvalid: true, raw: {} });
    const { id } = await account();

    expect(await cachedDailyNote(id)).toMatchObject({ ok: false, message: "cookie 已失效", cookieInvalid: true });
    expect((await account()).cookieInvalid).toBe(false);
  });

  it("cookie 解不開_不呼叫 HoYoLAB_回報失效_不寫資料庫", async () => {
    await testDb.update(starrailAccounts).set({ cookieEncrypted: "v1:broken" });
    const { id } = await account();

    expect(await cachedDailyNote(id)).toMatchObject({ ok: false, cookieInvalid: true });
    expect(hoyolab.fetchDailyNote).not.toHaveBeenCalled();
    expect((await account()).cookieInvalid).toBe(false);
  });

  it("帳號已經刪除_回錯誤訊息", async () => {
    expect(await cachedDailyNote(999_999)).toMatchObject({ ok: false, cookieInvalid: false });
  });
});

describe("syncCookieInvalid：頁面在回應後同步 cookie 失效標記（after()）", () => {
  it("標記有變_寫入並讓帳號失效（expire: 0）", async () => {
    const { id } = await account();

    expect(await syncCookieInvalid(id, true)).toBe(true);

    expect((await testDb.select().from(starrailAccounts).where(eq(starrailAccounts.id, id)))[0].cookieInvalid).toBe(true);
    expect(vi.mocked(revalidateTag).mock.calls).toEqual([["starrail:accounts", { expire: 0 }]]);
  });

  it("標記沒變_不寫入也不失效", async () => {
    const { id } = await account();

    expect(await syncCookieInvalid(id, false)).toBe(false);
    expect(revalidateTag).not.toHaveBeenCalled();
  });
});
