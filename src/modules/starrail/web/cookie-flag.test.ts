import { beforeEach, describe, expect, it, vi } from "vitest";
import { TEST_SESSION } from "@/dev/session-stub";
import { captureErrorLog, loggedText, mocksOf } from "@/dev/test-helpers";
import type { Endgame } from "../lib/endgame";

vi.mock("@/core/auth", () => import("@/dev/session-stub"));
vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("../service/cached", { spy: true });
vi.mock("../service/accounts", { spy: true });

const cached = mocksOf(await import("../service/cached"), "cachedDailyNote", "cachedCharacters", "cachedEndgame");
const accounts = mocksOf(await import("../service/accounts"), "syncCookieInvalid");
const { after } = await import("next/server");
const { syncCookieFlagAfter } = await import("./cookie-flag");
const { DailyNotePanel } = await import("./components/account-card");
const { CharacterPanel } = await import("./components/character-panel");
const { EndgamePanel } = await import("./components/endgame-panel");

const fetchedAt = new Date();
const account = (cookieInvalid: boolean) => ({ id: 3, uid: "900000003", nickname: "開拓者", region: "prod_official_cht", level: 70, staminaAlertThreshold: null, cookieInvalid });
const failed = (cookieInvalid: boolean) => ({ ok: false as const, message: cookieInvalid ? "HoYoLAB cookie 已失效" : "HoYoLAB 說查詢太頻繁", fetchedAt, cookieInvalid });
const empty: Endgame = { mode: "chaos", hasData: false, name: null, begin: null, end: null, stars: null, maxFloor: null, battles: null, floors: [] };
const endgameOk = { ok: true as const, endgame: empty, fetchedAt, cookieInvalid: false as const };
/** 執行排進 after() 的工作 正式環境要等回應送出後才跑 */
const runAfter = async () => {
  for (const [task] of vi.mocked(after).mock.calls) await (task as () => Promise<unknown>)();
};

beforeEach(() => {
  vi.mocked(after).mockReset();
  accounts.syncCookieInvalid.mockReset().mockResolvedValue(true);
  cached.cachedDailyNote.mockReset().mockResolvedValue(failed(false));
  cached.cachedCharacters.mockReset().mockResolvedValue({ ok: true, characters: [], fetchedAt, cookieInvalid: false });
  cached.cachedEndgame.mockReset().mockResolvedValue(endgameOk);
});

describe("syncCookieFlagAfter：HoYoLAB 回應的 cookie 狀態寫回帳號的標記", () => {
  it("跟帳號上的標記一樣_不排工作、不寫資料庫", () => {
    syncCookieFlagAfter(TEST_SESSION.id, account(true), true);
    syncCookieFlagAfter(TEST_SESSION.id, account(false), false);

    expect(after).not.toHaveBeenCalled();
  });

  it("不一樣_回應送出後才寫回（快取函式裡不能寫入），帶登入者與這個帳號的 id", async () => {
    syncCookieFlagAfter(TEST_SESSION.id, account(false), true);

    expect(after).toHaveBeenCalledTimes(1);
    expect(accounts.syncCookieInvalid).not.toHaveBeenCalled();
    await runAfter();
    expect(accounts.syncCookieInvalid).toHaveBeenCalledWith(TEST_SESSION.id, 3, true);
  });

  it("寫回失敗_log 只記錯誤種類，不記錯誤內容", async () => {
    const log = captureErrorLog();
    accounts.syncCookieInvalid.mockRejectedValue(new Error("connection to 10.0.0.1 failed: password=hunter2"));

    syncCookieFlagAfter(TEST_SESSION.id, account(true), false);
    await runAfter();

    expect(loggedText(log)).toContain("同步 cookie 狀態失敗");
    expect(loggedText(log)).not.toContain("hunter2");
  });
});

describe("星穹鐵道頁各區塊的 cookie 失效標記", () => {
  it("即時便箋讀到 cookie 失效、帳號還沒標記_回應後標上", async () => {
    cached.cachedDailyNote.mockResolvedValue(failed(true));

    await DailyNotePanel({ account: account(false) });
    await runAfter();

    expect(accounts.syncCookieInvalid).toHaveBeenCalledWith(TEST_SESSION.id, 3, true);
  });

  it("角色資料讀得到、帳號標著失效_回應後清掉（重新連結前就恢復的 cookie）", async () => {
    await CharacterPanel({ account: account(true) });
    await runAfter();

    expect(accounts.syncCookieInvalid).toHaveBeenCalledWith(TEST_SESSION.id, 3, false);
  });

  it("終局戰績有一種讀到 cookie 失效_回應後標上", async () => {
    cached.cachedEndgame.mockResolvedValueOnce(endgameOk).mockResolvedValueOnce(failed(true));

    await EndgamePanel({ account: account(false) });
    await runAfter();

    expect(accounts.syncCookieInvalid).toHaveBeenCalledTimes(1);
    expect(accounts.syncCookieInvalid).toHaveBeenCalledWith(TEST_SESSION.id, 3, true);
  });

  it("終局戰績只設不清：全部讀得到也不清掉帳號上的標記（其他戰績讀得到不代表 cookie 沒問題）", async () => {
    await EndgamePanel({ account: account(true) });

    expect(after).not.toHaveBeenCalled();
  });

  it("終局戰績讀到 cookie 失效、帳號已經標著_不再寫一次", async () => {
    cached.cachedEndgame.mockResolvedValue(failed(true));

    await EndgamePanel({ account: account(true) });

    expect(after).not.toHaveBeenCalled();
  });
});
