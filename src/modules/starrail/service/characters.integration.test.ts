import { cacheLife } from "next/cache";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { insertTestUsers, setupTestDb, type TestDb } from "@/dev/test-db";
import { stubCoreEnv } from "@/dev/test-env";
import { captureErrorLog, loggedText, resetNextCache, tagged } from "@/dev/test-helpers";
import type { StarrailCharacter } from "../lib/characters";
import { starrailAccounts } from "../data/schema";
import { COOKIE, hoyolab, ok, ROLE } from "../dev/fixtures";

vi.mock("../lib/hoyolab", async () => (await import("../dev/fixtures")).hoyolab);

stubCoreEnv();

const { cachedCharacters, cachedDailyNote } = await import("./cached");
const { linkAccount } = await import("./link");

const SEELE: StarrailCharacter = {
  id: 1102,
  name: "希兒",
  level: 80,
  eidolon: 2,
  rarity: 5,
  element: "quantum",
  elementIcon: "/icons/starrail/element/quantum.png",
  path: 2,
  pathIcon: "/icons/starrail/path/hunt.png",
  icon: "https://act-webstatic.hoyoverse.com/icon/1102.png",
  image: null,
  lightCone: null,
  relics: [],
  eidolons: [],
  stats: [],
  traces: [],
};

let testDb: TestDb;
setupTestDb((d) => (testDb = d));
let me: string;
let other: string;

const account = async () => (await testDb.select().from(starrailAccounts))[0];

beforeEach(async () => {
  [me, other] = await insertTestUsers(testDb);
  for (const fn of Object.values(hoyolab)) fn.mockReset();
  hoyolab.fetchGameRoles.mockResolvedValue(ok([ROLE]));
  // 回應裡夾帶 cookie 也不能跟著進到快取
  hoyolab.fetchCharacters.mockResolvedValue({ ...ok({ characters: [SEELE], missing: [] }), echo: COOKIE });
  await linkAccount(me, COOKIE);
  resetNextCache();
});

describe("cachedCharacters：角色資料，每個帳號快取 30 分鐘", () => {
  it("參數只有帳號 id_在快取函式裡才解密 cookie_回傳值沒有 cookie 與原始回應", async () => {
    const { id } = await account();

    const result = await cachedCharacters(me, id);

    expect(hoyolab.fetchCharacters).toHaveBeenCalledWith(COOKIE, "900000001", "prod_official_cht");
    expect(result).toMatchObject({ ok: true, characters: [SEELE] });
    expect(result.ok && result.fetchedAt).toBeInstanceOf(Date);
    expect(JSON.stringify(result)).not.toContain("v2_secret_token");
  });

  it("讀了帳號的 cookie 與 UID：標 starrail:accounts（重新連結時重查）_成功時用 records 效期（30 分鐘）", async () => {
    await cachedCharacters(me, (await account()).id);

    expect(tagged()).toEqual(["starrail:accounts"]);
    expect(cacheLife).toHaveBeenCalledWith("records");
    expect(cacheLife).toHaveBeenCalledTimes(1);
  });

  it("資料不公開等錯誤_回中文訊息_短效期（打開設定後幾分鐘內就看得到）；log 只記 retcode", async () => {
    const log = captureErrorLog();
    hoyolab.fetchCharacters.mockResolvedValue({ ok: false, retcode: 10102, message: "角色詳情沒有公開：到 HoYoLAB → 戰績 → 設定，打開角色詳情", cookieInvalid: false, body: "raw-body" });

    const result = await cachedCharacters(me, (await account()).id);

    expect(result).toMatchObject({ ok: false, message: expect.stringContaining("打開角色詳情") });
    expect(cacheLife).toHaveBeenCalledWith("external");
    expect(loggedText(log)).toContain("10102");
    expect(loggedText(log)).not.toContain("raw-body");
  });

  it("cookie 失效_只在這一塊寫原因，快取函式裡不寫資料庫（帳號的失效標記只看即時便箋）", async () => {
    hoyolab.fetchCharacters.mockResolvedValue({ ok: false, retcode: -100, message: "cookie 已失效", cookieInvalid: true });

    expect(await cachedCharacters(me, (await account()).id)).toMatchObject({ ok: false, message: "cookie 已失效" });
    expect((await account()).cookieInvalid).toBe(false);
  });

  it("cookie 解不開_不呼叫 HoYoLAB_說明要重新連結", async () => {
    await testDb.update(starrailAccounts).set({ cookieEncrypted: "v1:broken" });

    expect(await cachedCharacters(me, (await account()).id)).toMatchObject({ ok: false, message: expect.stringContaining("cookie 無法解密") });
    expect(hoyolab.fetchCharacters).not.toHaveBeenCalled();
  });

  it("帳號已經刪除_回錯誤訊息", async () => {
    expect(await cachedCharacters(me, 999_999)).toMatchObject({ ok: false, message: "找不到這個帳號，請重新整理頁面" });
  });

  it("格式跟預期不同_照常回傳讀得到的部分_log 只記缺少的欄位名稱", async () => {
    const log = captureErrorLog();
    hoyolab.fetchCharacters.mockResolvedValue({ ...ok({ characters: [{ ...SEELE, name: null }], missing: ["avatar_list[].name"] }), body: { name: "希兒的原文" } });

    const result = await cachedCharacters(me, (await account()).id);

    expect(result.ok && result.characters[0].name).toBeNull();
    expect(loggedText(log)).toContain("avatar_list[].name");
    expect(loggedText(log)).not.toContain("希兒的原文");
  });
});

describe("cachedDailyNote：便箋另外帶上委託", () => {
  it("委託跟便箋數字分開回傳", async () => {
    const expeditions = [{ name: "委託", status: "ongoing", remainingSeconds: 600, avatars: ["https://act-webstatic.hoyoverse.com/a/1.png"] }];
    hoyolab.fetchDailyNote.mockResolvedValue(ok({ stamina: 100, maxStamina: 300, expeditions }));

    const result = await cachedDailyNote(me, (await account()).id);

    expect(result).toMatchObject({ ok: true, expeditions });
    expect(result.ok && result.note).not.toHaveProperty("expeditions");
  });
});

describe("擁有權：別人的帳號 id 當作不存在", () => {
  it("用別人的帳號 id 讀角色與便箋_回找不到，不呼叫 HoYoLAB", async () => {
    const { id } = await account();

    expect(await cachedCharacters(other, id)).toMatchObject({ ok: false, message: "找不到這個帳號，請重新整理頁面" });
    expect(await cachedDailyNote(other, id)).toMatchObject({ ok: false, cookieInvalid: false });
    expect(hoyolab.fetchCharacters).not.toHaveBeenCalled();
    expect(hoyolab.fetchDailyNote).not.toHaveBeenCalled();
  });
});
