import { beforeEach, describe, expect, it, vi } from "vitest";
import { TEST_SESSION } from "@/dev/session-stub";
import { captureErrorLog, loggedText, mocksOf } from "@/dev/test-helpers";
import type { Endgame } from "../lib/endgame";
import { accountView } from "../dev/fixtures";

vi.mock("@/core/auth", () => import("@/dev/session-stub"));
vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("../service/cached", { spy: true });
vi.mock("../service/accounts", { spy: true });

const cached = mocksOf(await import("../service/cached"), "cachedDailyNote", "cachedCharacters", "cachedEndgame", "cachedLedger", "cachedProfile");
const accounts = mocksOf(await import("../service/accounts"), "syncCookieInvalid");
const { after } = await import("next/server");
const { syncCookieFlagAfter } = await import("./cookie-flag");
const { DailyNotePanel } = await import("./components/daily-note-panel");
const { CharacterPanel } = await import("./components/character-panel");
const { EndgamePanel } = await import("./components/endgame-panel");
const { LedgerPanel } = await import("./components/ledger-panel");
const { LoadedAccountAvatar } = await import("./components/account-avatar");

const fetchedAt = new Date();
const account = (cookieInvalid: boolean) => accountView({ cookieInvalid });
// 便箋讀不到時帶著 cookie 狀態 戰績類的結果沒有這個欄位 多給了畫面也不能理
const failed = (cookieInvalid: boolean) => ({ ok: false as const, message: cookieInvalid ? "HoYoLAB cookie 已失效" : "HoYoLAB 說查詢太頻繁", cookieInvalid });
const empty: Endgame = { mode: "chaos", hasData: false, name: null, begin: null, end: null, stars: null, maxFloor: null, battles: null, floors: [] };
const endgameOk = { ok: true as const, endgame: empty };
const ledgerOk = {
  ok: true as const,
  ledger: { month: "202610", months: ["202610"], current: { jade: 0, passes: 0 }, today: { jade: null, passes: null }, sources: [] },
  fetchedAt,
};
/** 執行排進 after() 的工作 正式環境要等回應送出後才跑 */
const runAfter = async () => {
  for (const [task] of vi.mocked(after).mock.calls) await (task as () => Promise<unknown>)();
};

beforeEach(() => {
  vi.mocked(after).mockReset();
  accounts.syncCookieInvalid.mockReset().mockResolvedValue(true);
  cached.cachedDailyNote.mockReset().mockResolvedValue(failed(false));
  cached.cachedCharacters.mockReset().mockResolvedValue({ ok: true, characters: [], fetchedAt });
  cached.cachedEndgame.mockReset().mockResolvedValue(endgameOk);
  cached.cachedLedger.mockReset().mockResolvedValue(ledgerOk);
  cached.cachedProfile.mockReset().mockResolvedValue(null);
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

describe("帳號的 cookie 失效標記只由即時便箋決定（排程的簽到與開拓力另外寫）", () => {
  it("即時便箋讀到 cookie 失效、帳號還沒標記_回應後標上", async () => {
    cached.cachedDailyNote.mockResolvedValue(failed(true));

    await DailyNotePanel({ account: account(false) });
    await runAfter();

    expect(accounts.syncCookieInvalid).toHaveBeenCalledWith(TEST_SESSION.id, 3, true);
  });

  it("即時便箋讀得到、帳號標著失效_回應後清掉（重新連結前就恢復的 cookie）", async () => {
    cached.cachedDailyNote.mockResolvedValue({ ok: true, note: {}, expeditions: [], fetchedAt, cookieInvalid: false });

    await DailyNotePanel({ account: account(true) });
    await runAfter();

    expect(accounts.syncCookieInvalid).toHaveBeenCalledWith(TEST_SESSION.id, 3, false);
  });

  // 各區塊各自設定或清掉的話 標記會在換頁之間來回跳 每跳一次帳號的快取就失效一次
  // 每一塊各有讀得到與讀不到的回應 遊戲頭像讀不到時只拿到 null
  const panels = [
    [
      "角色",
      { ok: () => cached.cachedCharacters.mockResolvedValue({ ok: true, characters: [], fetchedAt }), fail: () => cached.cachedCharacters.mockResolvedValue(failed(true)) },
      (a: ReturnType<typeof account>) => CharacterPanel({ account: a }),
    ],
    ["終局戰績", { ok: () => cached.cachedEndgame.mockResolvedValue(endgameOk), fail: () => cached.cachedEndgame.mockResolvedValue(failed(true)) }, (a: ReturnType<typeof account>) => EndgamePanel({ account: a })],
    ["開拓月曆", { ok: () => cached.cachedLedger.mockResolvedValue(ledgerOk), fail: () => cached.cachedLedger.mockResolvedValue(failed(true)) }, (a: ReturnType<typeof account>) => LedgerPanel({ account: a })],
    [
      "遊戲頭像",
      { ok: () => cached.cachedProfile.mockResolvedValue("https://act-webstatic.hoyoverse.com/darkmatter/hkrpg/head/201102.png"), fail: () => cached.cachedProfile.mockResolvedValue(null) },
      (a: ReturnType<typeof account>) => LoadedAccountAvatar({ account: a, size: "md", placeholder: null }),
    ],
  ] as const;

  it.each(panels)("%s讀到 cookie 失效_只在那一塊說明，不標帳號", async (_name, respond, render) => {
    respond.fail();

    await render(account(false));

    expect(after).not.toHaveBeenCalled();
    expect(accounts.syncCookieInvalid).not.toHaveBeenCalled();
  });

  it.each(panels)("%s讀得到、帳號標著失效_也不清掉", async (_name, respond, render) => {
    respond.ok();

    await render(account(true));

    expect(after).not.toHaveBeenCalled();
    expect(accounts.syncCookieInvalid).not.toHaveBeenCalled();
  });
});
