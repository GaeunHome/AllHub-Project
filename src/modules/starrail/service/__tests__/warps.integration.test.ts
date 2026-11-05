import { beforeEach, describe, expect, it, vi } from "vitest";
import { encryptSecret } from "@/core/crypto";
import { coreServiceStatus } from "@/core/db/schema";
import { insertTestUsers, setupTestDb } from "@/dev/test-db";
import { stubCoreEnv } from "@/dev/test-env";
import { captureErrorLog, loggedText } from "@/dev/test-helpers";
import { starrailAccounts } from "../../data/schema";
import { hoyolab, ok } from "../../dev/fixtures";
import { WARP_BANNERS, type WarpPage } from "../../lib/warps";

vi.mock("../../lib/hoyolab", async () => (await import("../../dev/fixtures")).hoyolab);

stubCoreEnv();

const { reportWarps, warpsFor } = await import("../warps");

const getDb = setupTestDb();
let me: string;
let other: string;
let accountId: number;

const noWait = async () => {};
const FULL_COOKIE = "ltoken_v2=secret_ltoken; ltuid_v2=1; cookie_token_v2=secret_token; account_mid_v2=m";
const LOGGED_IN = `${FULL_COOKIE}; e_hkrpg_token=secret_badge`;

async function insertAccount(userId: string, uid: string, cookie = FULL_COOKIE) {
  const [row] = await getDb()
    .insert(starrailAccounts)
    .values({ userId, ltuid: "1", cookieEncrypted: encryptSecret(cookie), uid, region: "prod_official_cht" })
    .returning({ id: starrailAccounts.id });
  return row.id;
}

const onePage = (rows: WarpPage["rows"], next: WarpPage["next"] = null) => ok<WarpPage>({ rows, next, incomplete: false, missing: [] });
const star = (name: string, pulls: number, isUp = true) => ({ pulls, star: { name, isUp, icon: null } });
const gachaTypes = () => hoyolab.fetchWarpPage.mock.calls.map(([, , , type]) => type as string);
const summaryOf = (read: Awaited<ReturnType<typeof warpsFor>>, id: number) => (read.ok ? read.summaries.find((row) => row.banner.id === id) : undefined);

beforeEach(async () => {
  [me, other] = await insertTestUsers(getDb());
  Object.values(hoyolab).forEach((fn) => fn.mockReset());
  hoyolab.warpLogin.mockResolvedValue(ok(LOGGED_IN));
  hoyolab.fetchWarpPage.mockResolvedValue(onePage([]));
  accountId = await insertAccount(me, "900000001");
});

describe("打開頁面時讀", () => {
  it("用這個帳號的 cookie、UID 與伺服器登入，登入拿到的 cookie 用來讀六個卡池", async () => {
    const read = await warpsFor(me, accountId, noWait);

    expect(read.ok).toBe(true);
    expect(hoyolab.warpLogin).toHaveBeenCalledExactlyOnceWith(FULL_COOKIE, "900000001", "prod_official_cht");
    expect(gachaTypes()).toEqual(WARP_BANNERS.map((banner) => banner.gachaType));
    expect(hoyolab.fetchWarpPage.mock.calls.every(([cookie, uid, region]) => cookie === LOGGED_IN && uid === "900000001" && region === "prod_official_cht")).toBe(true);
  });

  it("每個卡池各算各的：角色活動的已墊不會算到常駐", async () => {
    hoyolab.fetchWarpPage.mockImplementation(async (_cookie: string, _uid: string, _region: string, type: string) =>
      onePage(type === "GachaType_AvatarUp" ? [{ pulls: 23, star: null }, star("真珠", 77)] : type === "GachaType_Standard" ? [star("瓦爾特", 76, false)] : []),
    );

    const read = await warpsFor(me, accountId, noWait);

    expect(summaryOf(read, 11)).toMatchObject({ pity: 23, remaining: 67, fiveStars: [{ name: "真珠", pulls: 77, lost: false }] });
    expect(summaryOf(read, 1)).toMatchObject({ pity: 0, fiveStars: [{ name: "瓦爾特", pulls: 76, lost: false }] });
  });

  it("has_more 時帶上一頁的游標繼續問，每一頁的五星都收進來，新的在前", async () => {
    hoyolab.fetchWarpPage.mockImplementation(async (_cookie: string, _uid: string, _region: string, type: string, cursor: { maxId: string } | null) => {
      if (type !== "GachaType_AvatarUp") return onePage([]);
      if (cursor === null) return onePage([{ pulls: 5, star: null }, star("真珠", 77)], { versionId: "41", maxId: "2" });
      return cursor.maxId === "2" ? onePage([star("瓦爾特", 76, false)], { versionId: "40", maxId: "1" }) : onePage([star("知更鳥•晴歌", 78)]);
    });

    const read = await warpsFor(me, accountId, noWait);

    expect(summaryOf(read, 11)?.fiveStars.map((row) => row.name)).toEqual(["真珠", "瓦爾特", "知更鳥•晴歌"]);
    expect(hoyolab.fetchWarpPage.mock.calls.filter(([, , , type]) => type === "GachaType_AvatarUp").map(([, , , , cursor]) => cursor)).toEqual([null, { versionId: "41", maxId: "2" }, { versionId: "40", maxId: "1" }]);
  });

  it("一直說還有下一頁（回應不對）_問到上限就停，算讀不完，不顯示少掉紀錄的數字", async () => {
    hoyolab.fetchWarpPage.mockResolvedValue(onePage([], { versionId: "41", maxId: "1" }));

    const read = await warpsFor(me, accountId, noWait);

    expect(read).toMatchObject({ ok: false, serviceDown: true });
    expect(gachaTypes().filter((type) => type === "GachaType_AvatarUp")).toHaveLength(30);
  });

  it("有下一頁卻讀不到游標_算讀不完，不顯示少掉紀錄的數字", async () => {
    hoyolab.fetchWarpPage.mockResolvedValue({ ok: true, data: { rows: [star("真珠", 77)], next: null, incomplete: true, missing: ["next_max_id"] } });

    expect(await warpsFor(me, accountId, noWait)).toMatchObject({ ok: false, serviceDown: true });
  });

  it("請求之間隔一小段時間，一個接一個問", async () => {
    const sleep = vi.fn<(ms: number) => Promise<void>>(noWait);

    await warpsFor(me, accountId, sleep);

    expect(sleep.mock.calls.every(([ms]) => ms === 200)).toBe(true);
    expect(sleep).toHaveBeenCalledTimes(WARP_BANNERS.length - 1);
  });
});

describe("讀不到", () => {
  it("cookie 沒有 cookie_token_v2_不對外發請求，請他重新貼上；不是服務的問題", async () => {
    const short = await insertAccount(me, "900000002", "ltoken_v2=t; ltuid_v2=1");

    const read = await warpsFor(me, short, noWait);

    expect(read).toMatchObject({ ok: false, serviceDown: false });
    expect(!read.ok && read.message).toContain("cookie_token_v2");
    expect(!read.ok && read.message).toContain("重新貼上");
    expect(hoyolab.warpLogin).not.toHaveBeenCalled();
  });

  it("登入被拒絕_是 cookie_token_v2 過期，不算服務有問題，不讀卡池", async () => {
    hoyolab.warpLogin.mockResolvedValue({ ok: false, retcode: -100, message: "cookie_token_v2 已過期，請重新貼上", cookieInvalid: true });

    const read = await warpsFor(me, accountId, noWait);

    expect(read).toMatchObject({ ok: false, message: "cookie_token_v2 已過期，請重新貼上", serviceDown: false });
    expect(hoyolab.fetchWarpPage).not.toHaveBeenCalled();
  });

  it("登入成功但讀卡池時被拒絕_一樣不算服務有問題", async () => {
    hoyolab.fetchWarpPage.mockResolvedValue({ ok: false, retcode: -100, message: "cookie_token_v2 已過期，請重新貼上", cookieInvalid: true });

    expect(await warpsFor(me, accountId, noWait)).toMatchObject({ ok: false, serviceDown: false });
  });

  it("HoYoLAB 自己出問題（查詢太頻繁、連不上）_算服務有問題，回 HoYoLAB 的原因", async () => {
    hoyolab.fetchWarpPage.mockResolvedValue({ ok: false, retcode: -110, message: "HoYoLAB 說查詢太頻繁，過幾分鐘再試（-110）", cookieInvalid: false });

    expect(await warpsFor(me, accountId, noWait)).toMatchObject({ ok: false, message: "HoYoLAB 說查詢太頻繁，過幾分鐘再試（-110）", serviceDown: true });
  });

  it.each([[10102], [10101], [1034], [5003], [10035], [10041]])("%i 是這個帳號自己的狀況（資料沒公開、今天的次數到了、要求驗證）_不算服務有問題", async (retcode) => {
    hoyolab.fetchWarpPage.mockResolvedValue({ ok: false, retcode, message: "這個帳號的問題", cookieInvalid: false });

    expect(await warpsFor(me, accountId, noWait)).toMatchObject({ ok: false, serviceDown: false });
  });

  it("中途某個卡池失敗_整次算失敗，不顯示算到一半的數字", async () => {
    hoyolab.fetchWarpPage.mockResolvedValueOnce(onePage([star("真珠", 77)])).mockResolvedValue({ ok: false, retcode: null, message: "連不上 HoYoLAB", cookieInvalid: false });

    expect((await warpsFor(me, accountId, noWait)).ok).toBe(false);
  });

  it("讀不到不動帳號的 cookie 失效標記（同開拓月曆）", async () => {
    hoyolab.warpLogin.mockResolvedValue({ ok: false, retcode: -100, message: "cookie_token_v2 已過期", cookieInvalid: true });

    await warpsFor(me, accountId, noWait);

    expect((await getDb().select().from(starrailAccounts))[0].cookieInvalid).toBe(false);
  });

  it("訊息與 log 都不含 cookie 的值；log 只記 retcode 與缺少的欄位名稱", async () => {
    const log = captureErrorLog();
    hoyolab.fetchWarpPage.mockResolvedValueOnce(ok<WarpPage>({ rows: [], next: null, incomplete: false, missing: ["list[].gacha_count"] })).mockResolvedValue({ ok: false, retcode: -110, message: "太頻繁", cookieInvalid: false });

    const read = await warpsFor(me, accountId, noWait);

    expect(loggedText(log)).toContain("-110");
    expect(loggedText(log)).toContain("list[].gacha_count");
    expect(JSON.stringify(read) + loggedText(log)).not.toMatch(/secret_(ltoken|token|badge)/);
  });

  it("成功的結果也不含 cookie：登入拿到的 cookie 不進回傳值", async () => {
    expect(JSON.stringify(await warpsFor(me, accountId, noWait))).not.toMatch(/secret_(ltoken|token|badge)/);
  });
});

describe("只看得到自己的（IDOR）", () => {
  it("別人的帳號 id：當作不存在，不登入、不讀卡池，也不用他的 cookie", async () => {
    const read = await warpsFor(other, accountId, noWait);

    expect(read).toMatchObject({ ok: false, serviceDown: false });
    expect(hoyolab.warpLogin).not.toHaveBeenCalled();
    expect(hoyolab.fetchWarpPage).not.toHaveBeenCalled();
  });
});

describe("系統狀態（快取函式裡不能寫資料庫 由頁面在回應後回報）", () => {
  const statusRow = async () => (await getDb().select().from(coreServiceStatus))[0];

  it("讀得到_正常", async () => {
    await reportWarps(await warpsFor(me, accountId, noWait));

    expect(await statusRow()).toMatchObject({ service: "starrail:warps", lastError: null });
    expect((await statusRow()).lastOkAt).not.toBeNull();
  });

  it("HoYoLAB 出問題_記下原因", async () => {
    hoyolab.fetchWarpPage.mockResolvedValue({ ok: false, retcode: -110, message: "太頻繁", cookieInvalid: false });

    await reportWarps(await warpsFor(me, accountId, noWait));

    expect(await statusRow()).toMatchObject({ service: "starrail:warps", lastError: "太頻繁", lastOkAt: null });
  });

  it("快取裡的舊結果不算這次讀到的：別人剛記下的問題不會被舊的成功蓋掉", async () => {
    const old = await warpsFor(me, accountId, noWait);
    hoyolab.fetchWarpPage.mockResolvedValue({ ok: false, retcode: -110, message: "太頻繁", cookieInvalid: false });
    await reportWarps(await warpsFor(me, accountId, noWait));

    await reportWarps(old, old.readAt + 10 * 60_000);

    expect(await statusRow()).toMatchObject({ lastError: "太頻繁", lastOkAt: null });
  });

  it("cookie_token_v2 過期是使用者自己的問題_不算服務有問題，什麼都不記", async () => {
    hoyolab.warpLogin.mockResolvedValue({ ok: false, retcode: -100, message: "過期", cookieInvalid: true });

    await reportWarps(await warpsFor(me, accountId, noWait));

    expect(await getDb().select().from(coreServiceStatus)).toEqual([]);
  });
});
