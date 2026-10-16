import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { coreNotifications, coreUsers } from "@/core/db/schema";
import { insertTestUser, setupTestDb } from "@/dev/test-db";
import { stubCoreEnv } from "@/dev/test-env";
import { captureErrorLog, loggedText, mocksOf } from "@/dev/test-helpers";
import type { PublicCode } from "../lib/codes";
import type { RedeemOutcome } from "../lib/redeem";
import { starrailAccounts, starrailRedeemCodes } from "../data/schema";

// 沒設定回應的呼叫只會拿到 undefined 不會連到真的 HoYoLAB 與 hoyo-codes
const hoyolab = vi.hoisted(() => ({ fetchGameRoles: vi.fn(), redeemCode: vi.fn() }));
const source = vi.hoisted(() => ({ fetchActiveCodes: vi.fn() }));
vi.mock("../lib/hoyolab", () => hoyolab);
vi.mock("../lib/codes", () => source);
vi.mock("@/core/notify", { spy: true });

stubCoreEnv();

const { notify } = mocksOf(await import("@/core/notify"), "notify");
const { linkAccount } = await import("./accounts");
const { autoRedeemAll } = await import("./auto-redeem");

// 兌換要 cookie_token_v2 account_id_v2 由 ltuid_v2 補上
const cookieOf = (ltuid: string) => `ltoken_v2=v2_secret_${ltuid}; ltuid_v2=${ltuid}; cookie_token_v2=ct_secret_${ltuid}`;
const role = (uid: string, nickname: string, region = "prod_official_cht") => ({ uid, nickname, region, regionName: null, level: 70 });
const code = (value: string, rewards: string | null = null): PublicCode => ({ code: value, rewards });
const success: RedeemOutcome = { ok: true, message: "獎勵會寄到遊戲內信箱", retcode: 0, cookieInvalid: false };
const failure = (retcode: number | null, cookieInvalid = false): RedeemOutcome => ({ ok: false, message: "", retcode, cookieInvalid });
const DAY_MS = 86_400_000;

/** 假的時鐘 每次兌換花一秒 等待直接往前推 */
let clockMs: number;
const clock = { now: () => clockMs, sleep: async (ms: number) => void (clockMs += ms) };
/** 每次送出兌換時的時間 帳號與兌換碼 */
let sent: { at: number; uid: string; code: string }[];

const getDb = setupTestDb();
let me: string;
let other: string;

async function linkFor(userId: string, roles: ReturnType<typeof role>[], ltuid: string, { autoRedeem = true, cookie = cookieOf(ltuid) } = {}) {
  hoyolab.fetchGameRoles.mockResolvedValue({ ok: true, data: roles, raw: {} });
  await linkAccount(userId, cookie, "all");
  if (autoRedeem) await getDb().update(starrailAccounts).set({ autoRedeem: true }).where(eq(starrailAccounts.ltuid, ltuid));
}
const tried = async () => (await getDb().select({ code: starrailRedeemCodes.code, result: starrailRedeemCodes.result }).from(starrailRedeemCodes)).map((r) => `${r.code}:${r.result}`).sort();
const accountIdOf = async (uid: string) => (await getDb().select().from(starrailAccounts).where(eq(starrailAccounts.uid, uid)))[0].id;
/** 每次送出花一秒 回應由帳號與兌換碼決定 */
const respondBy = (outcomes: (uid: string, value: string) => RedeemOutcome) =>
  hoyolab.redeemCode.mockImplementation(async (_cookie: string, uid: string, _region: string, value: string) => {
    sent.push({ at: clockMs, uid, code: value });
    clockMs += 1000;
    return outcomes(uid, value);
  });

beforeEach(async () => {
  me = await insertTestUser(getDb(), "alice", { role: "owner" });
  other = await insertTestUser(getDb(), "bob");
  Object.values(hoyolab).forEach((fn) => fn.mockReset());
  source.fetchActiveCodes.mockReset().mockResolvedValue([code("GIFTNEW1", "60 stellar jade"), code("GIFTNEW2")]);
  notify.mockReset().mockResolvedValue(undefined);
  clockMs = 0;
  sent = [];
  respondBy(() => success);
});

describe("autoRedeemAll：替打開自動兌換的帳號送出還沒試過的兌換碼", () => {
  it("用帳號自己的 cookie、UID 與伺服器送出；記下試過的碼，第二天不再送", async () => {
    await linkFor(me, [role("900000001", "開拓者")], "41");

    await autoRedeemAll(clock);

    expect(hoyolab.redeemCode).toHaveBeenCalledWith(cookieOf("41"), "900000001", "prod_official_cht", "GIFTNEW1");
    expect(sent.map((s) => s.code)).toEqual(["GIFTNEW1", "GIFTNEW2"]);
    expect(await tried()).toEqual(["GIFTNEW1:success", "GIFTNEW2:success"]);

    hoyolab.redeemCode.mockClear();
    await autoRedeemAll(clock);
    expect(hoyolab.redeemCode).not.toHaveBeenCalled();
  });

  it("一個帳號的碼都試完就寄一則給擁有者：列出這次兌換成功的碼與社群寫的獎勵，連到這個帳號", async () => {
    await linkFor(me, [role("900000001", "開拓者")], "41");

    await autoRedeemAll(clock);

    expect(notify).toHaveBeenCalledOnce();
    const [input] = notify.mock.calls[0];
    expect(input).toMatchObject({ recipients: [me], module: "starrail", url: `/starrail?account=${await accountIdOf("900000001")}` });
    expect(input.body).toContain("GIFTNEW1（60 stellar jade）");
    expect(input.body).toContain("GIFTNEW2");
  });

  it("每個 HoYoLAB 帳號試完就馬上寄，不用等別人的帳號試完", async () => {
    await linkFor(me, [role("900000001", "開拓者")], "41");
    await linkFor(other, [role("900000002", "鮑勃")], "42");
    // 開拓者已經試過 GIFTNEW2 這次只剩一個碼
    await getDb().insert(starrailRedeemCodes).values({ accountId: await accountIdOf("900000001"), code: "GIFTNEW2", result: "success" });
    const events: string[] = [];
    respondBy((uid, value) => (events.push(`送出 ${uid} ${value}`), success));
    notify.mockImplementation(async (input: { recipients: string[] }) => void events.push(`通知 ${input.recipients[0] === me ? "開拓者" : "鮑勃"}`));

    await autoRedeemAll(clock);

    expect(events).toEqual(["送出 900000001 GIFTNEW1", "通知 開拓者", "送出 900000002 GIFTNEW1", "送出 900000002 GIFTNEW2", "通知 鮑勃"]);
  });

  it("同一個 HoYoLAB 帳號兩次兌換之間至少隔 5 秒（CLAUDE.md〈HoYoLAB〉：兩次兌換之間約 5 秒的冷卻，從上一次的回應起算）", async () => {
    await linkFor(me, [role("900000001", "開拓者"), role("800000002", "小號", "prod_official_asia")], "41");

    await autoRedeemAll(clock);

    expect(sent).toHaveLength(4);
    for (let i = 1; i < sent.length; i++) expect(sent[i].at - (sent[i - 1].at + 1000)).toBeGreaterThanOrEqual(5_000);
  });

  it("同一個 HoYoLAB 帳號的兩個角色合寄一則：每一行寫是哪個角色兌換到哪個碼，連到星穹鐵道頁", async () => {
    await linkFor(me, [role("900000001", "開拓者"), role("800000002", "小號", "prod_official_asia")], "41");

    await autoRedeemAll(clock);

    expect(notify).toHaveBeenCalledOnce();
    const [input] = notify.mock.calls[0];
    expect(input).toMatchObject({ recipients: [me], url: "/starrail" });
    const lines = input.body.split("\n");
    expect(lines.filter((line: string) => line.startsWith("開拓者"))).toHaveLength(2);
    expect(lines.filter((line: string) => line.startsWith("小號"))).toHaveLength(2);
  });

  it("不同人的 HoYoLAB 帳號輪流送，一個人等冷卻時先送別人的；每個人只收到自己帳號的通知", async () => {
    await linkFor(me, [role("900000001", "開拓者")], "41");
    await linkFor(other, [role("900000002", "鮑勃")], "42");

    await autoRedeemAll(clock);

    expect(sent.map((s) => s.uid)).toEqual(["900000001", "900000002", "900000001", "900000002"]);
    // 鮑勃的第一個碼在開拓者的 5 秒冷卻結束前就送出
    expect(sent[1].at).toBeLessThan(sent[0].at + 1000 + 5_000);
    const [mine, theirs] = [await accountIdOf("900000001"), await accountIdOf("900000002")];
    expect(notify).toHaveBeenCalledTimes(2);
    for (const [input] of notify.mock.calls) {
      const own = input.recipients[0] === me;
      expect(input.recipients).toEqual([own ? me : other]);
      expect(input.url).toBe(`/starrail?account=${own ? mine : theirs}`);
      expect(input.body).toContain(own ? "開拓者" : "鮑勃");
      expect(input.body).not.toContain(own ? "鮑勃" : "開拓者");
    }
  });

  it("兌換只花 30 秒：30 秒後不再送新的，剩下的明天再試（第二天接著送沒試過的）", async () => {
    source.fetchActiveCodes.mockResolvedValue(Array.from({ length: 10 }, (_, i) => code(`GIFTBATCH${i}`)));
    await linkFor(me, [role("900000001", "開拓者")], "41");

    const summary = await autoRedeemAll(clock);

    expect(sent.length).toBeLessThan(10);
    expect(Math.max(...sent.map((s) => s.at))).toBeLessThanOrEqual(30_000);
    expect(summary).toContain(`剩 ${10 - sent.length} 個明天再試`);
    // 時間到停下時 已經成功的碼一起寄一則
    expect(notify).toHaveBeenCalledOnce();
    for (const s of sent) expect(notify.mock.calls[0][0].body).toContain(s.code);

    clockMs += DAY_MS;
    const secondDay = clockMs;
    await autoRedeemAll(clock);
    expect(sent.filter((s) => s.at >= secondDay).map((s) => s.code)).toEqual(Array.from({ length: 10 }, (_, i) => `GIFTBATCH${i}`).slice(10 - sent.filter((s) => s.at >= secondDay).length));
    expect(sent.map((s) => s.code).sort()).toEqual(Array.from({ length: 10 }, (_, i) => `GIFTBATCH${i}`).sort());
  });

  it("要求驗證（風控）_整批停下，那個碼不記下來，明天再試", async () => {
    captureErrorLog();
    await linkFor(me, [role("900000001", "開拓者")], "41");
    await linkFor(other, [role("900000002", "鮑勃")], "42");
    hoyolab.redeemCode.mockResolvedValueOnce(failure(10035));

    expect(await autoRedeemAll(clock)).toContain("HoYoLAB 要求驗證");

    expect(hoyolab.redeemCode).toHaveBeenCalledOnce();
    expect(await tried()).toEqual([]);
    expect(notify).not.toHaveBeenCalled();
  });

  it("要求驗證時整批停下_已經兌換成功的碼照樣寄出", async () => {
    captureErrorLog();
    await linkFor(me, [role("900000001", "開拓者")], "41");
    respondBy((_uid, value) => (value === "GIFTNEW1" ? success : failure(10035)));

    await autoRedeemAll(clock);

    expect(notify).toHaveBeenCalledOnce();
    expect(notify.mock.calls[0][0].body).toContain("GIFTNEW1");
    expect(notify.mock.calls[0][0].body).not.toContain("GIFTNEW2");
  });

  it("請求太頻繁（genshin.py 的 VisitsTooFrequently -110）_這個 HoYoLAB 帳號今天先停、不記下來；別人照樣兌換", async () => {
    captureErrorLog();
    await linkFor(me, [role("900000001", "開拓者")], "41");
    await linkFor(other, [role("900000002", "鮑勃")], "42");
    respondBy((uid) => (uid === "900000001" ? failure(-110) : success));

    await autoRedeemAll(clock);

    expect(sent.filter((s) => s.uid === "900000001")).toHaveLength(1);
    expect(sent.filter((s) => s.uid === "900000002")).toHaveLength(2);
    expect(await tried()).toEqual(["GIFTNEW1:success", "GIFTNEW2:success"]);
  });

  it("還沒開放（genshin.py：-2014 Redemption code not activated）_不記下來，同一個帳號接著送下一個碼；第二天再試", async () => {
    captureErrorLog();
    await linkFor(me, [role("900000001", "開拓者")], "41");
    respondBy((_uid, value) => (value === "GIFTNEW1" ? failure(-2014) : success));

    await autoRedeemAll(clock);

    expect(sent.map((s) => s.code)).toEqual(["GIFTNEW1", "GIFTNEW2"]);
    expect(await tried()).toEqual(["GIFTNEW2:success"]);

    respondBy(() => success);
    clockMs += DAY_MS;
    await autoRedeemAll(clock);
    expect(sent.map((s) => s.code)).toEqual(["GIFTNEW1", "GIFTNEW2", "GIFTNEW1"]);
  });

  it("cookie 失效_這個 HoYoLAB 帳號今天先跳過、不記下來；別人照樣兌換", async () => {
    captureErrorLog();
    await linkFor(me, [role("900000001", "開拓者")], "41");
    await linkFor(other, [role("900000002", "鮑勃")], "42");
    respondBy((uid) => (uid === "900000001" ? failure(-1071, true) : success));

    await autoRedeemAll(clock);

    expect(sent.filter((s) => s.uid === "900000001")).toHaveLength(1);
    expect(sent.filter((s) => s.uid === "900000002")).toHaveLength(2);
    expect(await tried()).toEqual(["GIFTNEW1:success", "GIFTNEW2:success"]);
  });

  it("已兌換過、過期、無效的記下來不再送；等級不足與認不得的代碼不記，明天再試", async () => {
    captureErrorLog();
    source.fetchActiveCodes.mockResolvedValue([code("USEDCODE"), code("EXPIREDX"), code("BADCODE"), code("LEVELUP"), code("WEIRDO")]);
    await linkFor(me, [role("900000001", "開拓者")], "41");
    const outcomes: Record<string, RedeemOutcome> = { USEDCODE: failure(-2017), EXPIREDX: failure(-2001), BADCODE: failure(-1065), LEVELUP: failure(-2021), WEIRDO: failure(-9999) };
    respondBy((_uid, value) => outcomes[value]);

    await autoRedeemAll(clock);

    expect(await tried()).toEqual(["BADCODE:invalid", "EXPIREDX:expired", "USEDCODE:already"]);
    expect(notify).not.toHaveBeenCalled();
  });

  it("每個沒成功的結果都記 retcode（只記數字），認不得的也記；log 不記兌換碼與 cookie", async () => {
    const log = captureErrorLog();
    source.fetchActiveCodes.mockResolvedValue([code("USEDCODE"), code("WEIRDO")]);
    await linkFor(me, [role("900000001", "開拓者")], "41");
    respondBy((_uid, value) => (value === "USEDCODE" ? failure(-2017) : failure(-9999)));

    await autoRedeemAll(clock);

    expect(loggedText(log)).toContain("retcode -2017");
    expect(loggedText(log)).toContain("retcode -9999");
    expect(loggedText(log)).not.toMatch(/USEDCODE|WEIRDO|ct_secret|v2_secret/);
  });

  it("連不上_log 不記兌換碼與 cookie", async () => {
    const log = captureErrorLog();
    await linkFor(me, [role("900000001", "開拓者")], "41");
    respondBy(() => failure(null));

    await autoRedeemAll(clock);

    expect(loggedText(log)).not.toContain("GIFTNEW");
    expect(loggedText(log)).not.toContain("ct_secret");
  });
});

describe("cookie 被 HoYoLAB 拒絕：通知擁有者重新貼上，一個遊戲帳號一週一則", () => {
  // 通知要真的寫進 core_notifications 一週內有沒有通知過看它
  beforeEach(() => {
    captureErrorLog();
    notify.mockReset();
    clockMs = Date.now();
    respondBy((uid) => (uid === "900000001" ? failure(-1071, true) : success));
  });
  const notices = async () => (await getDb().select().from(coreNotifications)).filter((n) => n.title.includes("自動兌換失敗"));

  it("通知擁有者：哪個帳號、cookie 已失效、請用「新增帳號或更新 cookie」重新貼上，連到這個帳號；別人不會收到", async () => {
    await linkFor(me, [role("900000001", "開拓者")], "41");
    await linkFor(other, [role("900000002", "鮑勃")], "42");

    await autoRedeemAll(clock);

    const [notice, ...rest] = await notices();
    expect(rest).toEqual([]);
    expect(notice).toMatchObject({ userId: me, module: "starrail", url: `/starrail?account=${await accountIdOf("900000001")}` });
    const text = `${notice.title} ${notice.body}`;
    expect(text).toContain("開拓者");
    expect(text).toContain("cookie 已失效");
    expect(text).toContain("「新增帳號或更新 cookie」");
  });

  it("隔天還是失效_同一週不再通知；一週後還沒修好_再通知一次", async () => {
    await linkFor(me, [role("900000001", "開拓者")], "41");

    await autoRedeemAll(clock);
    for (let day = 1; day <= 6; day++) {
      clockMs += DAY_MS;
      await autoRedeemAll(clock);
    }
    expect(await notices()).toHaveLength(1);

    clockMs += DAY_MS;
    await autoRedeemAll(clock);
    expect(await notices()).toHaveLength(2);
  });

  it("同一天排程送了兩次、前一次還在寫通知時後一次就開始了_只通知一次", async () => {
    await linkFor(me, [role("900000001", "開拓者")], "41");
    let release!: () => void;
    notify.mockImplementationOnce(() => new Promise<void>((resolve) => (release = resolve)));

    const first = autoRedeemAll(clock);
    await vi.waitFor(() => expect(notify).toHaveBeenCalledOnce());
    await autoRedeemAll(clock);
    release();
    await first;

    expect(notify).toHaveBeenCalledOnce();
  });

  it("通知寫不進去_放掉這次的認領，下一次排程再通知", async () => {
    await linkFor(me, [role("900000001", "開拓者")], "41");
    notify.mockRejectedValueOnce(new Error("db down"));

    await autoRedeemAll(clock);
    expect(await notices()).toHaveLength(0);

    await autoRedeemAll(clock);
    expect(await notices()).toHaveLength(1);
  });
});

describe("哪些帳號會自動兌換", () => {
  it("沒打開的帳號不兌換；沒有人打開時連兌換碼清單都不讀", async () => {
    await linkFor(me, [role("900000001", "開拓者")], "41", { autoRedeem: false });

    expect(await autoRedeemAll(clock)).toBe("沒有打開自動兌換的帳號");
    expect(source.fetchActiveCodes).not.toHaveBeenCalled();
    expect(hoyolab.redeemCode).not.toHaveBeenCalled();
  });

  it("cookie 少了 cookie_token_v2_略過不送", async () => {
    await linkFor(me, [role("900000001", "開拓者")], "41", { cookie: "ltoken_v2=v2_secret_41; ltuid_v2=41" });

    expect(await autoRedeemAll(clock)).toContain("cookie 不能兌換");
    expect(hoyolab.redeemCode).not.toHaveBeenCalled();
  });

  it("帳號標著 cookie 失效_略過", async () => {
    await linkFor(me, [role("900000001", "開拓者")], "41");
    await getDb().update(starrailAccounts).set({ cookieInvalid: true });

    await autoRedeemAll(clock);

    expect(hoyolab.redeemCode).not.toHaveBeenCalled();
  });

  it("停用的人（凍結）_不用他的 cookie 兌換，也不通知他", async () => {
    await linkFor(me, [role("900000001", "開拓者")], "41");
    await linkFor(other, [role("900000002", "鮑勃")], "42");
    await getDb().update(coreUsers).set({ disabledAt: new Date() }).where(eq(coreUsers.id, other));

    await autoRedeemAll(clock);

    expect(sent.every((s) => s.uid === "900000001")).toBe(true);
    expect(notify.mock.calls.flatMap(([input]) => input.recipients)).not.toContain(other);
  });

  it("兌換碼清單讀不到_什麼都不送，明天再試", async () => {
    await linkFor(me, [role("900000001", "開拓者")], "41");
    source.fetchActiveCodes.mockResolvedValue(null);

    expect(await autoRedeemAll(clock)).toBe("讀不到兌換碼清單，明天再試");
    expect(hoyolab.redeemCode).not.toHaveBeenCalled();
  });

  it("移除遊戲帳號時試過的兌換碼一起刪", async () => {
    await linkFor(me, [role("900000001", "開拓者")], "41");
    await autoRedeemAll(clock);

    await getDb().delete(starrailAccounts);

    expect(await tried()).toEqual([]);
  });
});
