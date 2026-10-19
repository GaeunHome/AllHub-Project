import { describe, expect, it, vi } from "vitest";
import { setupTestDb } from "@/dev/test-db";
import { captureErrorLog, loggedText } from "@/dev/test-helpers";

// 放掉認領失敗的情況要換掉 releaseOnce 其他照原本的實作寫資料庫
vi.mock("./auth/attempts", { spy: true });

const attempts = await import("./auth/attempts");
const actual = await vi.importActual<typeof import("./auth/attempts")>("./auth/attempts");
const { claimKey, sendOnce, sendOnceEach, sendOrRelease } = await import("./claim");

setupTestDb();
const NOW = new Date("2026-10-19T22:00:00Z");
const LOG = { module: "starrail", what: "放掉通知的認領失敗" };
const ONCE = { scope: "starrail:daily", now: NOW, log: LOG };

describe("claimKey：認領用的 key 只存雜湊", () => {
  it("各段用冒號接起來再算 sha256（跟之前寫進資料庫的 key 一樣，部署前後不會重複寄）", () => {
    // 答案用 shasum -a 256 另外算的
    expect(claimKey(42, "2026-10-19")).toBe("a0de5446bf6ddfbb193fe72b817309f2ccd05e3d80a9c7e6c8e0f533976bedec");
    expect(claimKey("6f1c2b9e-3a4d-4c5e-8f70-1a2b3c4d5e6f", "2026-10-19")).toBe("e32629e696b5cbff86b0bfa4ece2f44ff922db35fe5bbcb44c7eaa1a21fafa68");
  });
});

describe("sendOnce：同一件事只寄一次，寄不出去就放掉，下一輪再寄", () => {
  it("第一次認領到就寄、回 true；同一期再來（重送的排程）不寄、回 false", async () => {
    const send = vi.fn(async () => {});

    expect(await sendOnce({ ...ONCE, key: claimKey(1, "2026-10-19") }, send)).toBe(true);
    expect(await sendOnce({ ...ONCE, key: claimKey(1, "2026-10-19") }, send)).toBe(false);
    expect(await sendOnce({ ...ONCE, key: claimKey(1, "2026-10-20") }, send)).toBe(true);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("寄不出去_放掉認領並丟出原本的錯誤，下一輪認領得到、照樣寄", async () => {
    const key = claimKey(1, "2026-10-19");
    const failure = new Error("notify 寫不進去");

    await expect(sendOnce({ ...ONCE, key }, () => Promise.reject(failure))).rejects.toBe(failure);
    expect(await sendOnce({ ...ONCE, key }, async () => {})).toBe(true);
  });

  it("放掉認領也失敗_丟出的還是寄送的錯誤，放掉的錯誤只記 log（只記種類）", async () => {
    const log = captureErrorLog();
    const failure = new Error("notify 寫不進去");
    vi.mocked(attempts.releaseOnce).mockRejectedValueOnce(Object.assign(new Error("secret-detail"), { name: "PostgresError" }));

    await expect(sendOnce({ ...ONCE, key: claimKey(1, "2026-10-19") }, () => Promise.reject(failure))).rejects.toBe(failure);
    expect(log.mock.calls).toEqual([["[starrail] 放掉通知的認領失敗", "PostgresError"]]);
    expect(loggedText(log)).not.toContain("secret-detail");
  });
});

describe("sendOrRelease：自己認領的（例如條件式 update），寄不出去就退回", () => {
  it("寄得出去_回傳結果、不退回", async () => {
    const release = vi.fn(async () => {});

    expect(await sendOrRelease(async () => "sent", release, LOG)).toBe("sent");
    expect(release).not.toHaveBeenCalled();
  });

  it("寄不出去_退回認領；退回也失敗時丟出的是寄送的錯誤（不被退回的錯誤蓋掉），退回的錯誤只記 log", async () => {
    const log = captureErrorLog();
    const failure = new Error("notify 寫不進去");
    const release = vi.fn(() => Promise.reject(Object.assign(new Error("secret-detail"), { name: "PostgresError" })));

    await expect(sendOrRelease(() => Promise.reject(failure), release, { module: "savings", what: "退回到期通知的認領失敗" })).rejects.toBe(failure);
    expect(release).toHaveBeenCalledTimes(1);
    expect(log.mock.calls).toEqual([["[savings] 退回到期通知的認領失敗", "PostgresError"]]);
  });
});

describe("sendOnceEach：一批人各自認領，認領到的一起寄一次", () => {
  const RAIN = { scope: "weather:rain", now: NOW, log: { module: "weather", what: "放掉下雨提醒的認領失敗" } };
  const keyOf = (userId: string) => claimKey(userId, "2026-10-20");

  it("今天已經收過的不再寄，其餘的一起寄一次", async () => {
    await sendOnceEach(RAIN, ["alice"], keyOf, async () => {});
    const recipients: string[][] = [];

    expect(await sendOnceEach(RAIN, ["alice", "bob", "carol"], keyOf, async (claimed) => void recipients.push(claimed))).toEqual({ ok: true, sent: ["bob", "carol"], already: ["alice"], failed: [] });
    expect(recipients).toEqual([["bob", "carol"]]);
  });

  it("全部都收過了_不呼叫 send", async () => {
    await sendOnceEach(RAIN, ["alice"], keyOf, async () => {});
    const send = vi.fn(async () => {});

    expect(await sendOnceEach(RAIN, ["alice"], keyOf, send)).toEqual({ ok: true, sent: [], already: ["alice"], failed: [] });
    expect(send).not.toHaveBeenCalled();
  });

  it("寄不出去_不丟出、錯誤放在結果裡；這次認領到的放掉（下一輪照樣寄），今天已經收過的不動", async () => {
    await sendOnceEach(RAIN, ["alice"], keyOf, async () => {});
    const failure = new Error("notify 寫不進去");

    expect(await sendOnceEach(RAIN, ["alice", "bob"], keyOf, () => Promise.reject(failure))).toEqual({ ok: false, error: failure, sent: [], already: ["alice"], failed: ["bob"] });
    expect(await sendOnceEach(RAIN, ["alice", "bob"], keyOf, async () => {})).toEqual({ ok: true, sent: ["bob"], already: ["alice"], failed: [] });
  });

  it("認領到一半出錯_放掉已經認領到的，還沒輪到的也算寄不出去", async () => {
    vi.mocked(attempts.claimOnce)
      .mockImplementationOnce(actual.claimOnce)
      .mockRejectedValueOnce(new Error("資料庫斷線"));
    const send = vi.fn(async () => {});

    const result = await sendOnceEach(RAIN, ["alice", "bob", "carol"], keyOf, send);

    expect(result).toMatchObject({ ok: false, sent: [], already: [], failed: ["alice", "bob", "carol"] });
    expect(send).not.toHaveBeenCalled();
    expect(await sendOnceEach(RAIN, ["alice"], keyOf, async () => {})).toMatchObject({ ok: true, sent: ["alice"] });
  });

  it("放掉其中一個失敗_其他人照樣放掉，失敗的只記 log", async () => {
    const log = captureErrorLog();
    vi.mocked(attempts.releaseOnce).mockRejectedValueOnce(Object.assign(new Error("secret-detail"), { name: "PostgresError" }));

    await sendOnceEach(RAIN, ["alice", "bob"], keyOf, () => Promise.reject(new Error("notify 寫不進去")));

    expect(log.mock.calls).toEqual([["[weather] 放掉下雨提醒的認領失敗", "PostgresError"]]);
    expect(await sendOnceEach(RAIN, ["alice", "bob"], keyOf, async () => {})).toEqual({ ok: true, sent: ["bob"], already: ["alice"], failed: [] });
  });
});
