import { cacheLife } from "next/cache";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { insertTestUser, setupTestDb, type TestDb } from "@/dev/test-db";
import { stubCoreEnv } from "@/dev/test-env";
import { captureErrorLog, loggedText, resetNextCache, tagged } from "@/dev/test-helpers";
import type { StarrailCharacter } from "../lib/characters";
import { starrailAccounts } from "../data/schema";

const hoyolab = vi.hoisted(() => ({ fetchGameRoles: vi.fn(), fetchDailyNote: vi.fn(), fetchCheckinInfo: vi.fn(), signIn: vi.fn(), fetchCharacters: vi.fn() }));
vi.mock("../lib/hoyolab", () => hoyolab);

stubCoreEnv();

const { cachedCharacters, cachedDailyNote } = await import("./cached");
const { linkAccount } = await import("./accounts");

const COOKIE = "ltoken_v2=v2_secret_token; ltuid_v2=42";
const ROLE = { uid: "900000001", nickname: "開拓者", region: "prod_official_cht", regionName: null, level: 70 };
const SEELE: StarrailCharacter = {
  id: 1102,
  name: "希兒",
  level: 80,
  eidolon: 2,
  rarity: 5,
  element: "quantum",
  path: 2,
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
  me = await insertTestUser(testDb, "alice", { role: "owner" });
  other = await insertTestUser(testDb, "bob");
  for (const fn of Object.values(hoyolab)) fn.mockReset();
  hoyolab.fetchGameRoles.mockResolvedValue({ ok: true, data: [ROLE], raw: {} });
  hoyolab.fetchCharacters.mockResolvedValue({ ok: true, data: { characters: [SEELE], missing: [] }, raw: { cookie_echo: COOKIE } });
  await linkAccount(me, COOKIE);
  resetNextCache();
});

describe("cachedCharacters：角色資料，每個帳號快取 30 分鐘", () => {
  it("參數只有帳號 id_在快取函式裡才解密 cookie_回傳值沒有 cookie 與原始回應", async () => {
    const { id } = await account();

    const result = await cachedCharacters(me, id);

    expect(hoyolab.fetchCharacters).toHaveBeenCalledWith(COOKIE, "900000001", "prod_official_cht");
    expect(result).toMatchObject({ ok: true, characters: [SEELE], cookieInvalid: false });
    expect(result.fetchedAt).toBeInstanceOf(Date);
    expect(JSON.stringify(result)).not.toContain("v2_secret_token");
    expect(result).not.toHaveProperty("raw");
  });

  it("讀了帳號的 cookie 與 UID：標 starrail:accounts（重新連結時重查）_成功時用 records 效期（30 分鐘）", async () => {
    await cachedCharacters(me, (await account()).id);

    expect(tagged()).toEqual(["starrail:accounts"]);
    expect(cacheLife).toHaveBeenCalledWith("records");
    expect(cacheLife).toHaveBeenCalledTimes(1);
  });

  it("資料不公開等錯誤_回中文訊息_短效期（打開設定後幾分鐘內就看得到）；log 只記 retcode", async () => {
    const log = captureErrorLog();
    hoyolab.fetchCharacters.mockResolvedValue({ ok: false, retcode: 10102, message: "角色詳情沒有公開：到 HoYoLAB → 戰績 → 設定，打開角色詳情", cookieInvalid: false, raw: { secret: "raw-body" } });

    const result = await cachedCharacters(me, (await account()).id);

    expect(result).toMatchObject({ ok: false, message: expect.stringContaining("打開角色詳情"), cookieInvalid: false });
    expect(cacheLife).toHaveBeenCalledWith("external");
    expect(loggedText(log)).toContain("10102");
    expect(loggedText(log)).not.toContain("raw-body");
  });

  it("cookie 失效_回報給呼叫端_快取函式裡不寫資料庫", async () => {
    hoyolab.fetchCharacters.mockResolvedValue({ ok: false, retcode: -100, message: "cookie 已失效", cookieInvalid: true, raw: {} });

    expect(await cachedCharacters(me, (await account()).id)).toMatchObject({ ok: false, cookieInvalid: true });
    expect((await account()).cookieInvalid).toBe(false);
  });

  it("cookie 解不開_不呼叫 HoYoLAB_回報失效", async () => {
    await testDb.update(starrailAccounts).set({ cookieEncrypted: "v1:broken" });

    expect(await cachedCharacters(me, (await account()).id)).toMatchObject({ ok: false, cookieInvalid: true });
    expect(hoyolab.fetchCharacters).not.toHaveBeenCalled();
  });

  it("帳號已經刪除_回錯誤訊息", async () => {
    expect(await cachedCharacters(me, 999_999)).toMatchObject({ ok: false, cookieInvalid: false });
  });

  it("格式跟預期不同_照常回傳讀得到的部分_log 只記缺少的欄位名稱", async () => {
    const log = captureErrorLog();
    hoyolab.fetchCharacters.mockResolvedValue({ ok: true, data: { characters: [{ ...SEELE, name: null }], missing: ["avatar_list[].name"] }, raw: { name: "希兒的原文" } });

    const result = await cachedCharacters(me, (await account()).id);

    expect(result.ok && result.characters[0].name).toBeNull();
    expect(loggedText(log)).toContain("avatar_list[].name");
    expect(loggedText(log)).not.toContain("希兒的原文");
  });
});

describe("cachedDailyNote：便箋另外帶上委託", () => {
  it("委託跟便箋數字分開回傳", async () => {
    const expeditions = [{ name: "委託", status: "ongoing", remainingSeconds: 600, avatars: ["https://act-webstatic.hoyoverse.com/a/1.png"], itemUrl: null }];
    hoyolab.fetchDailyNote.mockResolvedValue({ ok: true, data: { stamina: 100, maxStamina: 300, expeditions }, raw: {} });

    const result = await cachedDailyNote(me, (await account()).id);

    expect(result).toMatchObject({ ok: true, expeditions });
    expect(result.ok && result.note).not.toHaveProperty("expeditions");
  });

  it("便箋沒有委託欄位_空列表", async () => {
    hoyolab.fetchDailyNote.mockResolvedValue({ ok: true, data: { stamina: 100, maxStamina: 300 }, raw: {} });

    expect(await cachedDailyNote(me, (await account()).id)).toMatchObject({ ok: true, expeditions: [] });
  });
});

describe("擁有權：別人的帳號 id 當作不存在", () => {
  it("用別人的帳號 id 讀角色與便箋_回找不到，不呼叫 HoYoLAB", async () => {
    const { id } = await account();

    expect(await cachedCharacters(other, id)).toMatchObject({ ok: false, cookieInvalid: false, message: "找不到這個帳號，請重新整理頁面" });
    expect(await cachedDailyNote(other, id)).toMatchObject({ ok: false, cookieInvalid: false });
    expect(hoyolab.fetchCharacters).not.toHaveBeenCalled();
    expect(hoyolab.fetchDailyNote).not.toHaveBeenCalled();
  });
});
