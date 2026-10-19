import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { coreUsers } from "@/core/db/schema";
import { insertTestUser, setupTestDb } from "@/dev/test-db";
import { stubCoreEnv } from "@/dev/test-env";
import { captureErrorLog, expiredTags, mocksOf, resetNextCache } from "@/dev/test-helpers";
import type { ActCalendar, CalendarChallenge } from "../lib/calendar";
import { starrailAccounts } from "../data/schema";
import { COOKIE, dailyNote as note, hoyolab, ok, role, ROLE as TW } from "../dev/fixtures";

vi.mock("../lib/hoyolab", async () => (await import("../dev/fixtures")).hoyolab);
vi.mock("@/core/notify", { spy: true });
vi.mock("@/core/crypto", { spy: true });

stubCoreEnv();

const { notify } = mocksOf(await import("@/core/notify"), "notify");
const crypto = mocksOf(await import("@/core/crypto"), "decryptSecret");
const { decryptSecret: realDecrypt } = await vi.importActual<typeof import("@/core/crypto")>("@/core/crypto");
const { checkStaminaAll } = await import("./stamina");
const { linkAccount } = await import("./link");

const US = role({ uid: "600000001", nickname: "美服", region: "prod_official_usa" });

// 台港澳服週一 2026-10-19 04:00 是 UTC 2026-10-18 20:00
const MONDAY_RESET = Date.parse("2026-10-18T20:00:00Z");
const chaos = (overrides: Partial<CalendarChallenge> = {}): CalendarChallenge => ({
  id: 1013, kind: "chaos", name: "永恆的信條", status: "ongoing", current: 24, total: 36,
  startsAt: MONDAY_RESET - 42 * 86_400_000, endsAt: MONDAY_RESET,
  ...overrides,
});
const calendar = (challenges: CalendarChallenge[]): ActCalendar => ({ version: "3.7", challenges, events: [], warps: [] });

const getDb = setupTestDb();
let me: string;

const kinds = () => notify.mock.calls.map(([input]) => input.kind);
const accountId = async () => (await getDb().select().from(starrailAccounts))[0].id;

beforeEach(async () => {
  me = await insertTestUser(getDb(), "alice", { role: "owner" });
  Object.values(hoyolab).forEach((fn) => fn.mockReset());
  notify.mockReset().mockResolvedValue(undefined);
  crypto.decryptSecret.mockReset();
  hoyolab.fetchGameRoles.mockResolvedValue(ok([TW]));
  // 便箋的開拓力是 100 不會發開拓力提醒 這裡只看其他提醒
  hoyolab.fetchDailyNote.mockResolvedValue(ok(note()));
  hoyolab.fetchActCalendar.mockResolvedValue(ok({ calendar: calendar([]), missing: [] }));
  await linkAccount(me, COOKIE, "all");
});

describe("每日實訓：晚上九點（伺服器當地）還沒做完", () => {
  it("台港澳服 21:30 提醒擁有者一次，連到這個帳號；同一晚再跑不重複，隔天晚上再提醒", async () => {
    await checkStaminaAll(new Date("2026-10-15T13:30:00Z"));
    await checkStaminaAll(new Date("2026-10-15T14:30:00Z"));

    expect(notify).toHaveBeenCalledOnce();
    const [input] = notify.mock.calls[0];
    expect(input).toMatchObject({ recipients: [me], module: "starrail", kind: "daily", url: `/starrail?account=${await accountId()}` });
    expect(input.body).toContain("300/500");

    await checkStaminaAll(new Date("2026-10-16T13:30:00Z"));
    expect(kinds()).toEqual(["daily", "daily"]);
  });

  it("20:30 還不提醒；做完了不提醒", async () => {
    await checkStaminaAll(new Date("2026-10-15T12:30:00Z"));
    hoyolab.fetchDailyNote.mockResolvedValue(ok(note({ trainScore: 500 })));
    await checkStaminaAll(new Date("2026-10-15T13:30:00Z"));

    expect(notify).not.toHaveBeenCalled();
  });

  it("美服照美服的時間（UTC−5）：台北晚上九點半（美服早上八點半）不提醒，美服晚上九點半（UTC 隔天 02:30）才提醒", async () => {
    await getDb().delete(starrailAccounts);
    hoyolab.fetchGameRoles.mockResolvedValue(ok([US]));
    await linkAccount(me, COOKIE, "all");

    await checkStaminaAll(new Date("2026-10-15T13:30:00Z"));
    expect(notify).not.toHaveBeenCalled();

    await checkStaminaAll(new Date("2026-10-16T02:30:00Z"));
    expect(kinds()).toEqual(["daily"]);
  });
});

describe("提醒寫不進去（通知丟錯）", () => {
  it("放掉這次的認領，下一輪排程再提醒", async () => {
    captureErrorLog();
    notify.mockRejectedValueOnce(new Error("db down"));

    await checkStaminaAll(new Date("2026-10-15T13:30:00Z"));
    await checkStaminaAll(new Date("2026-10-15T14:30:00Z"));

    expect(kinds()).toEqual(["daily", "daily"]);
  });
});

describe("每週內容：週日傍晚（週一 04:00 換週前）", () => {
  beforeEach(() => hoyolab.fetchDailyNote.mockResolvedValue(ok(note({ trainScore: 500 }))));

  it("模擬宇宙積分沒滿、歷戰餘響還有次數_週日 18:30 提醒一次，兩項都寫出來", async () => {
    await checkStaminaAll(new Date("2026-10-18T10:30:00Z"));
    await checkStaminaAll(new Date("2026-10-18T13:30:00Z"));

    expect(kinds()).toEqual(["weekly"]);
    const [input] = notify.mock.calls[0];
    expect(input.recipients).toEqual([me]);
    expect(input.body).toContain("8000/14000");
    expect(input.body).toContain("2/3");
  });

  it("都做完了、或還沒到週日傍晚_不提醒", async () => {
    await checkStaminaAll(new Date("2026-10-17T12:00:00Z"));
    hoyolab.fetchDailyNote.mockResolvedValue(ok(note({ trainScore: 500, rogueScore: 14000, cocoonRemaining: 0 })));
    await checkStaminaAll(new Date("2026-10-18T10:30:00Z"));

    expect(notify).not.toHaveBeenCalled();
  });
});

describe("終局挑戰：還剩一到兩天、進度沒滿（活動日曆）", () => {
  beforeEach(() => hoyolab.fetchDailyNote.mockResolvedValue(ok(note({ trainScore: 500 }))));

  it("週六 18:30（還剩 33.5 小時）提醒一次：用這個帳號的 cookie 查活動日曆，寫出進度", async () => {
    hoyolab.fetchActCalendar.mockResolvedValue(ok({ calendar: calendar([chaos()]), missing: [] }));

    await checkStaminaAll(new Date("2026-10-17T10:30:00Z"));
    await checkStaminaAll(new Date("2026-10-17T11:30:00Z"));

    expect(hoyolab.fetchActCalendar).toHaveBeenCalledWith(COOKIE, "900000001", "prod_official_cht");
    expect(kinds()).toEqual(["endgame"]);
    expect(notify.mock.calls[0][0]).toMatchObject({ recipients: [me], url: `/starrail?account=${await accountId()}` });
    expect(notify.mock.calls[0][0].body).toContain("24/36");
  });

  it("同一期只提醒一次：隔天傍晚（剩不到一天、前一天的去重紀錄已經過了一天）也不再提醒", async () => {
    hoyolab.fetchActCalendar.mockResolvedValue(ok({ calendar: calendar([chaos()]), missing: [] }));
    // 每週內容也做完 週日傍晚才不會有每週的提醒
    hoyolab.fetchDailyNote.mockResolvedValue(ok(note({ trainScore: 500, rogueScore: 14000, cocoonRemaining: 0 })));

    await checkStaminaAll(new Date("2026-10-17T10:30:00Z"));
    await checkStaminaAll(new Date("2026-10-18T10:45:00Z"));

    expect(kinds()).toEqual(["endgame"]);
  });

  it("傍晚六點前不查活動日曆", async () => {
    await checkStaminaAll(new Date("2026-10-17T09:30:00Z"));

    expect(hoyolab.fetchActCalendar).not.toHaveBeenCalled();
  });

  it("拿滿了、這一期已完成_不提醒", async () => {
    hoyolab.fetchActCalendar.mockResolvedValue(ok({ calendar: calendar([chaos({ current: 36 }), chaos({ id: 2008, kind: "fiction", status: "finished" })]), missing: [] }));

    await checkStaminaAll(new Date("2026-10-17T10:30:00Z"));

    expect(notify).not.toHaveBeenCalled();
  });

  it("活動日曆讀不到或出錯_不影響開拓力的結果，log 只記 retcode", async () => {
    const log = captureErrorLog();
    hoyolab.fetchActCalendar.mockResolvedValueOnce({ ok: false, retcode: 10102, message: "資料沒有公開", cookieInvalid: false, body: "raw-body" });

    expect(await checkStaminaAll(new Date("2026-10-17T10:30:00Z"))).toContain("100/300");

    hoyolab.fetchActCalendar.mockRejectedValueOnce(new Error("boom"));
    expect(await checkStaminaAll(new Date("2026-10-17T11:30:00Z"))).toContain("100/300");
    expect(JSON.stringify(log.mock.calls)).not.toContain("raw-body");
  });
});

describe("帳號設定的「每日、每週與終局提醒」", () => {
  it("關掉_每日實訓、每週內容與終局挑戰都不提醒，也不查活動日曆；開拓力提醒照門檻", async () => {
    await getDb().update(starrailAccounts).set({ gameReminders: false });
    // 開拓力 290 已經過了預設門檻 280
    hoyolab.fetchDailyNote.mockResolvedValue(ok(note({ stamina: 290 })));
    hoyolab.fetchActCalendar.mockResolvedValue(ok({ calendar: calendar([chaos()]), missing: [] }));

    // 台港澳服週六 21:30 是每日實訓與終局挑戰的時段 週日 18:30 是每週內容的時段
    await checkStaminaAll(new Date("2026-10-17T13:30:00Z"));
    await checkStaminaAll(new Date("2026-10-18T10:30:00Z"));

    expect(kinds()).toEqual(["stamina"]);
    expect(hoyolab.fetchActCalendar).not.toHaveBeenCalled();
  });

  it("開著（同樣的時段與進度）_三種都提醒", async () => {
    hoyolab.fetchActCalendar.mockResolvedValue(ok({ calendar: calendar([chaos()]), missing: [] }));

    await checkStaminaAll(new Date("2026-10-17T13:30:00Z"));
    await checkStaminaAll(new Date("2026-10-18T10:30:00Z"));

    expect(kinds().sort()).toEqual(["daily", "endgame", "weekly"]);
  });
});

describe("終局提醒前要再解一次 cookie", () => {
  it("解不開（例如換了金鑰）_標記 cookie 失效，帳號的快取也跟著失效", async () => {
    captureErrorLog();
    resetNextCache();
    crypto.decryptSecret.mockImplementationOnce(realDecrypt).mockImplementationOnce(() => {
      throw new Error("bad key");
    });

    // 台港澳服週六 18:30 先查便箋 再查活動日曆
    await checkStaminaAll(new Date("2026-10-17T10:30:00Z"));

    expect((await getDb().select().from(starrailAccounts))[0].cookieInvalid).toBe(true);
    expect(expiredTags()).toContain("starrail:accounts");
  });
});

describe("提醒只給帳號的擁有者，停用的人凍結", () => {
  it("停用的帳號_排程不查他的便箋，也不發提醒", async () => {
    await getDb().update(coreUsers).set({ disabledAt: new Date() }).where(eq(coreUsers.id, me));

    await checkStaminaAll(new Date("2026-10-15T13:30:00Z"));

    expect(hoyolab.fetchDailyNote).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
  });

  it("兩個人各自的帳號_各自收到自己的提醒", async () => {
    const other = await insertTestUser(getDb(), "bob");
    hoyolab.fetchGameRoles.mockResolvedValue(ok([role({ uid: "900000002", nickname: "鮑勃" })]));
    await linkAccount(other, "ltoken_v2=v2_bob; ltuid_v2=43", "all");

    await checkStaminaAll(new Date("2026-10-15T13:30:00Z"));

    expect(notify.mock.calls.map(([input]) => [input.recipients, input.title.split(" ")[0]]).sort()).toEqual(
      [
        [[me], "開拓者"],
        [[other], "鮑勃"],
      ].sort(),
    );
  });
});
