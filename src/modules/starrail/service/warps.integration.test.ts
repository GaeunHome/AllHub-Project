import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { encryptSecret } from "@/core/crypto";
import { coreServiceStatus, coreUsers } from "@/core/db/schema";
import { insertTestUsers, setupTestDb } from "@/dev/test-db";
import { stubCoreEnv } from "@/dev/test-env";
import { captureErrorLog, loggedText } from "@/dev/test-helpers";
import { starrailAccounts, starrailWarps } from "../data/schema";
import { hoyolab, ok } from "../dev/fixtures";
import { WARP_PAGE_SIZE, type Warp } from "../lib/warps";

vi.mock("../lib/hoyolab", async () => (await import("../dev/fixtures")).hoyolab);

stubCoreEnv();

const { pruneWarps, syncAllWarps, syncWarpsFor, syncWarpsManually, warpListFor, warpSummaryFor } = await import("./warps");

const getDb = setupTestDb();
let me: string;
let other: string;
let accountId: number;

const noWait = { now: () => 0, sleep: async () => {} };
const FULL_COOKIE = "ltoken_v2=t; ltuid_v2=1; cookie_token_v2=c; account_mid_v2=m";

async function insertAccount(userId: string, uid: string, cookie = FULL_COOKIE, values: Partial<typeof starrailAccounts.$inferInsert> = {}) {
  const [row] = await getDb()
    .insert(starrailAccounts)
    .values({ userId, ltuid: "1", cookieEncrypted: encryptSecret(cookie), uid, region: "prod_official_cht", ...values })
    .returning({ id: starrailAccounts.id });
  return row.id;
}

const warp = (id: number | string, overrides: Partial<Warp> = {}): Warp => ({
  id: String(id),
  bannerType: 11,
  gachaId: 1,
  itemId: 1,
  name: `項目 ${id}`,
  itemType: "角色",
  rarity: 3,
  time: new Date(Date.UTC(2026, 0, 1, 0, 0, Number(id) % 86400)),
  ...overrides,
});
/** 新的在前 跟 HoYoverse 一樣 第 2 頁從上一頁最舊那筆之後開始 */
function serve(warps: Warp[], bannerType = 11) {
  const sorted = warps.toSorted((a, b) => (BigInt(a.id) < BigInt(b.id) ? 1 : -1));
  hoyolab.fetchWarpPage.mockImplementation(async (_key: string, banner: number, endId: string) => {
    if (banner !== bannerType) return ok({ warps: [], missing: [] });
    const start = endId === "0" ? 0 : sorted.findIndex((row) => row.id === endId) + 1;
    return ok({ warps: sorted.slice(start, start + WARP_PAGE_SIZE), missing: [] });
  });
}
const savedIds = async () => (await getDb().select({ id: starrailWarps.id }).from(starrailWarps).where(eq(starrailWarps.accountId, accountId))).map((row) => row.id).toSorted((a, b) => Number(a) - Number(b));
const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i);
const pagesFor = (banner: number) => hoyolab.fetchWarpPage.mock.calls.filter(([, type]) => type === banner).length;

beforeEach(async () => {
  [me, other] = await insertTestUsers(getDb());
  Object.values(hoyolab).forEach((fn) => fn.mockReset());
  hoyolab.fetchWarpAuthkey.mockResolvedValue(ok("key"));
  serve([]);
  accountId = await insertAccount(me, "900000001");
});

describe("同步", () => {
  it("第一次：把每個卡池的每一頁都抓完存起來（45 抽要 3 頁）", async () => {
    serve(range(1, 45).map((id) => warp(id)));

    expect(await syncWarpsFor(me, accountId, noWait)).toEqual({ ok: true, added: 45 });

    expect(await savedIds()).toEqual(range(1, 45).map(String));
    expect(pagesFor(11)).toBe(3);
    expect(pagesFor(12)).toBe(1);
  });

  it("金鑰是用這個帳號的 cookie、UID 與伺服器換的，換好的金鑰用來讀紀錄", async () => {
    await syncWarpsFor(me, accountId, noWait);

    expect(hoyolab.fetchWarpAuthkey).toHaveBeenCalledWith(FULL_COOKIE, "900000001", "prod_official_cht");
    expect(hoyolab.fetchWarpPage.mock.calls.every(([key]) => key === "key")).toBe(true);
  });

  it("第二次只抓比上次新的，看到存過的就停，不重複也不多問", async () => {
    serve(range(1, 45).map((id) => warp(id)));
    await syncWarpsFor(me, accountId, noWait);
    hoyolab.fetchWarpPage.mockClear();
    serve(range(1, 47).map((id) => warp(id)));

    expect(await syncWarpsFor(me, accountId, noWait)).toEqual({ ok: true, added: 2 });

    expect(pagesFor(11)).toBe(1);
    expect(await savedIds()).toEqual(range(1, 47).map(String));
  });

  it("沒有新的抽卡_寫入 0 筆", async () => {
    serve(range(1, 5).map((id) => warp(id)));
    await syncWarpsFor(me, accountId, noWait);

    expect(await syncWarpsFor(me, accountId, noWait)).toEqual({ ok: true, added: 0 });
  });

  it("中途某一頁失敗_這個卡池一筆都不寫，下次才能從頭補，不會留下缺口", async () => {
    const all = range(1, 45).map((id) => warp(id));
    serve(all);
    const works = hoyolab.fetchWarpPage.getMockImplementation()!;
    let calls = 0;
    hoyolab.fetchWarpPage.mockImplementation(async (...args: Parameters<typeof works>) => {
      calls += 1;
      return calls === 2 ? { ok: false, retcode: -101, message: "金鑰過期", cookieInvalid: false } : works(...args);
    });

    expect(await syncWarpsFor(me, accountId, noWait)).toMatchObject({ ok: false });
    expect(await savedIds()).toEqual([]);

    serve(all);
    await syncWarpsFor(me, accountId, noWait);
    expect(await savedIds()).toEqual(range(1, 45).map(String));
  });

  it("換不到金鑰（cookie_token_v2 失效）_回 HoYoLAB 的原因，不讀紀錄，也不動帳號的 cookie 失效標記", async () => {
    hoyolab.fetchWarpAuthkey.mockResolvedValue({ ok: false, retcode: -100, message: "請重新貼上 cookie", cookieInvalid: true });

    expect(await syncWarpsFor(me, accountId, noWait)).toEqual({ ok: false, error: "請重新貼上 cookie" });

    expect(hoyolab.fetchWarpPage).not.toHaveBeenCalled();
    expect((await getDb().select().from(starrailAccounts))[0].cookieInvalid).toBe(false);
  });

  it("系統狀態：全部讀完算正常", async () => {
    await syncWarpsFor(me, accountId, noWait);

    const [row] = await getDb().select().from(coreServiceStatus);
    expect(row).toMatchObject({ service: "starrail:warps", lastError: null });
    expect(row.lastOkAt).not.toBeNull();
  });

  it("系統狀態：金鑰被拒絕時記下原因（使用者遇過 -100：authkey error）", async () => {
    hoyolab.fetchWarpPage.mockResolvedValue({ ok: false, retcode: -100, message: "HoYoverse 不接受（-100：authkey error）", cookieInvalid: false });

    await syncWarpsFor(me, accountId, noWait);

    const [row] = await getDb().select().from(coreServiceStatus);
    expect(row).toMatchObject({ service: "starrail:warps", lastError: "HoYoverse 不接受（-100：authkey error）", lastOkAt: null });
  });

  it("系統狀態：cookie 失效是使用者自己的問題 不算服務有問題", async () => {
    hoyolab.fetchWarpAuthkey.mockResolvedValue({ ok: false, retcode: -100, message: "請重新貼上 cookie", cookieInvalid: true });

    await syncWarpsFor(me, accountId, noWait);

    expect(await getDb().select().from(coreServiceStatus)).toEqual([]);
  });

  it("回應裡沒有金鑰_回錯誤，不讀紀錄", async () => {
    hoyolab.fetchWarpAuthkey.mockResolvedValue(ok(null));

    expect(await syncWarpsFor(me, accountId, noWait)).toMatchObject({ ok: false });
    expect(hoyolab.fetchWarpPage).not.toHaveBeenCalled();
  });

  it("cookie 沒有 cookie_token_v2_不換金鑰，說明要重新貼 cookie", async () => {
    const short = await insertAccount(me, "900000002", "ltoken_v2=t; ltuid_v2=1");

    const result = await syncWarpsFor(me, short, noWait);

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toContain("cookie_token_v2");
    expect(hoyolab.fetchWarpAuthkey).not.toHaveBeenCalled();
  });

  it("log 不記金鑰與 cookie", async () => {
    const log = captureErrorLog();
    hoyolab.fetchWarpPage.mockResolvedValue({ ok: false, retcode: -101, message: "x", cookieInvalid: false });

    await syncWarpsFor(me, accountId, noWait);

    expect(loggedText(log)).toContain("-101");
    expect(loggedText(log)).not.toContain("key");
    expect(loggedText(log)).not.toContain("cookie_token_v2=");
  });
});

describe("立即更新", () => {
  const NOW = new Date("2026-11-04T04:00:00Z");

  it("一分鐘內再按一次_不對 HoYoverse 發請求，說還要等幾秒", async () => {
    await syncWarpsManually(me, accountId, NOW);
    hoyolab.fetchWarpAuthkey.mockClear();

    const result = await syncWarpsManually(me, accountId, new Date(NOW.getTime() + 20_000));

    expect(result).toEqual({ ok: false, error: "剛更新過，40 秒後再試" });
    expect(hoyolab.fetchWarpAuthkey).not.toHaveBeenCalled();
  });

  it("過了一分鐘可以再按；別人不受影響", async () => {
    const second = await insertAccount(other, "900000002");
    await syncWarpsManually(me, accountId, NOW);

    expect((await syncWarpsManually(me, accountId, new Date(NOW.getTime() + 61_000))).ok).toBe(true);
    expect((await syncWarpsManually(other, second, NOW)).ok).toBe(true);
  });
});

describe("上限：每個遊戲帳號最多留幾抽，超過時移除最舊的", () => {
  it("只移除最舊的，新的都留著", async () => {
    await getDb().insert(starrailWarps).values(range(1, 6).map((id) => ({ ...warp(id), accountId })));

    await pruneWarps(accountId, 4);

    expect(await savedIds()).toEqual(["3", "4", "5", "6"]);
  });

  it("id 用數字比大小，不是字串（9 比 10 舊）", async () => {
    await getDb().insert(starrailWarps).values([9, 10, 11].map((id) => ({ ...warp(id), accountId })));

    await pruneWarps(accountId, 2);

    expect(await savedIds()).toEqual(["10", "11"]);
  });

  it("沒超過_不動；別的帳號不受影響", async () => {
    const second = await insertAccount(other, "900000002");
    await getDb().insert(starrailWarps).values([...range(1, 3).map((id) => ({ ...warp(id), accountId })), ...range(1, 3).map((id) => ({ ...warp(id), accountId: second }))]);

    await pruneWarps(accountId, 3);
    await pruneWarps(accountId, 2);

    expect(await savedIds()).toEqual(["2", "3"]);
    expect(await getDb().select().from(starrailWarps).where(eq(starrailWarps.accountId, second))).toHaveLength(3);
  });
});

describe("只看得到自己的（IDOR）", () => {
  it("別人的帳號 id：不能同步、不換金鑰、讀不到摘要與清單", async () => {
    await getDb().insert(starrailWarps).values({ ...warp(1), accountId });

    expect(await syncWarpsFor(other, accountId, noWait)).toMatchObject({ ok: false });
    expect(hoyolab.fetchWarpAuthkey).not.toHaveBeenCalled();
    expect(await warpSummaryFor(other, accountId)).toBeNull();
    expect(await warpListFor(other, accountId, 11, 1)).toBeNull();
  });

  it("移除星穹鐵道帳號時紀錄一起刪", async () => {
    await getDb().insert(starrailWarps).values({ ...warp(1), accountId });

    await getDb().delete(starrailAccounts).where(eq(starrailAccounts.id, accountId));

    expect(await getDb().select().from(starrailWarps)).toEqual([]);
  });
});

describe("畫面要的資料", () => {
  it("摘要照卡池分開算：新手池的抽數不算進角色池的已墊", async () => {
    await getDb().insert(starrailWarps).values([
      { ...warp(1, { rarity: 5, name: "希兒" }), accountId },
      { ...warp(2), accountId },
      { ...warp(3), accountId },
      { ...warp(4, { bannerType: 2 }), accountId },
    ]);

    const summary = await warpSummaryFor(me, accountId);

    expect(summary?.find((row) => row.banner.id === 11)).toMatchObject({ total: 3, pity: 2, pityKnown: true });
    expect(summary?.find((row) => row.banner.id === 2)).toMatchObject({ total: 1, pity: 1, pityKnown: false });
  });

  it("還沒有紀錄_每個卡池都是 0，不是 null（頁面要請他同步）", async () => {
    const summary = await warpSummaryFor(me, accountId);

    expect(summary?.every((row) => row.total === 0)).toBe(true);
  });

  it("全部抽卡一頁 20 筆，新的在前，只有這個卡池", async () => {
    await getDb().insert(starrailWarps).values([...range(1, 25).map((id) => ({ ...warp(id), accountId })), { ...warp(99, { bannerType: 2 }), accountId }]);

    const first = await warpListFor(me, accountId, 11, 1);
    const second = await warpListFor(me, accountId, 11, 2);

    expect(first?.total).toBe(25);
    expect(first?.warps.map((row) => row.id)).toEqual(range(6, 25).toReversed().map(String));
    expect(second?.warps.map((row) => row.id)).toEqual(range(1, 5).toReversed().map(String));
  });
});

describe("每天的排程", () => {
  it("處理擁有者沒停用、cookie 沒失效、有 cookie_token_v2 的帳號；其他不換金鑰", async () => {
    await insertAccount(other, "900000002", FULL_COOKIE, { cookieInvalid: true });
    await insertAccount(other, "900000003", "ltoken_v2=t; ltuid_v2=1");

    const summary = await syncAllWarps(noWait);

    expect(hoyolab.fetchWarpAuthkey).toHaveBeenCalledOnce();
    expect(hoyolab.fetchWarpAuthkey.mock.calls[0][1]).toBe("900000001");
    expect(summary).toContain("1");
  });

  it("擁有者被停用_不處理他的帳號", async () => {
    await getDb().update(coreUsers).set({ disabledAt: new Date() }).where(eq(coreUsers.id, me));

    await syncAllWarps(noWait);

    expect(hoyolab.fetchWarpAuthkey).not.toHaveBeenCalled();
  });

  it("一個帳號出錯不影響其他帳號", async () => {
    await insertAccount(other, "900000002");
    hoyolab.fetchWarpAuthkey.mockRejectedValueOnce(new Error("boom"));

    await syncAllWarps(noWait);

    expect(hoyolab.fetchWarpAuthkey).toHaveBeenCalledTimes(2);
  });

  it("超過時間預算_剩下的帳號明天再做", async () => {
    await insertAccount(other, "900000002");
    let time = 0;
    hoyolab.fetchWarpAuthkey.mockImplementation(async () => {
      time += 1_000_000;
      return ok("key");
    });

    const summary = await syncAllWarps({ now: () => time, sleep: async () => {} });

    expect(hoyolab.fetchWarpAuthkey).toHaveBeenCalledOnce();
    expect(summary).toContain("略過");
  });

  it("摘要只有數字，不寫 UID 與名稱", async () => {
    serve([warp(1, { name: "希兒" })]);

    const summary = await syncAllWarps(noWait);

    expect(summary).not.toContain("900000001");
    expect(summary).not.toContain("希兒");
  });
});
