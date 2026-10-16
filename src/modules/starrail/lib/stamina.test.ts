import { describe, expect, it } from "vitest";
import { parseDailyNote } from "./responses";
import { alertThreshold, staminaAlertAction, staminaGauge } from "./stamina";

const note = (stamina: number | null, max: number | null = 240) =>
  parseDailyNote({ current_stamina: stamina, max_stamina: max });

describe("alertThreshold", () => {
  it("defaults to max minus 20", () => {
    expect(alertThreshold(note(0), null)).toBe(220);
  });

  it("prefers the account's custom threshold", () => {
    expect(alertThreshold(note(0), 200)).toBe(200);
  });

  it("is null when max stamina is unknown and no custom value", () => {
    expect(alertThreshold(note(0, null), null)).toBeNull();
  });
});

// Vercel Hobby 的排程只保證在那個小時內執行 每小時一次的兩次之間最長將近兩小時
// 遊戲規則每 6 分鐘回 1 點 兩小時 20 點
describe("staminaAlertAction：兩次排程之間最長將近兩小時，兩小時內會達到門檻就先通知", () => {
  it("門檻 220（上限 240 減 20）：開拓力 200 再兩小時就到門檻_通知", () => {
    expect(staminaAlertAction(note(200), null, false)).toBe("alert");
  });

  it("門檻 220：開拓力 199 兩小時後只有 219_不通知", () => {
    expect(staminaAlertAction(note(199), null, false)).toBe("none");
  });

  it("已經到門檻_第一次通知", () => {
    expect(staminaAlertAction(note(220), null, false)).toBe("alert");
  });

  it("這一輪通知過了_還差一點或已經滿了都不再通知", () => {
    expect(staminaAlertAction(note(215), null, true)).toBe("none");
    expect(staminaAlertAction(note(240), null, true)).toBe("none");
  });

  it("通知過後用掉開拓力_降到兩小時內到不了門檻才重設（200 不重設、199 重設）", () => {
    expect(staminaAlertAction(note(200), null, true)).toBe("none");
    expect(staminaAlertAction(note(199), null, true)).toBe("reset");
    expect(staminaAlertAction(note(100), null, true)).toBe("reset");
  });

  it("門檻等於上限 240：開拓力 220 兩小時內會回滿_通知；219 只回到 239_不通知", () => {
    expect(staminaAlertAction(note(220), 240, false)).toBe("alert");
    expect(staminaAlertAction(note(219), 240, false)).toBe("none");
  });

  it("自然回復只到上限：門檻設得比上限高_滿了也不通知（等於關閉提醒）", () => {
    expect(staminaAlertAction(note(240), 245, false)).toBe("none");
    expect(staminaAlertAction(note(225), 241, false)).toBe("none");
  });

  it("讀不到開拓力_不動作", () => {
    expect(staminaAlertAction(note(null), null, false)).toBe("none");
  });
});

describe("staminaGauge：開拓力的進度條與回滿時間（星穹鐵道頁與首頁共用）", () => {
  const fetchedAt = new Date("2026-10-07T04:00:00Z");
  const withRecover = (stamina: number | null, max: number | null, recover: number | null) =>
    parseDailyNote({ current_stamina: stamina, max_stamina: max, stamina_recover_time: recover });

  it("進度是目前／上限的百分比（四捨五入）", () => {
    expect(staminaGauge(withRecover(231, 300, 3600), fetchedAt, fetchedAt).percent).toBe(77);
  });

  it("超過上限也只畫滿；讀不到目前或上限_0", () => {
    expect(staminaGauge(withRecover(320, 300, 0), fetchedAt, fetchedAt).percent).toBe(100);
    expect(staminaGauge(withRecover(null, 300, null), fetchedAt, fetchedAt).percent).toBe(0);
    expect(staminaGauge(withRecover(100, null, null), fetchedAt, fetchedAt).percent).toBe(0);
  });

  it("回滿時間從查詢當下起算（便箋可能是幾分鐘前查的）", () => {
    const now = new Date("2026-10-07T04:10:00Z");

    expect(staminaGauge(withRecover(200, 300, 3600), fetchedAt, now).fullAt?.toISOString()).toBe("2026-10-07T05:00:00.000Z");
  });

  it("回滿時間已經過了或本來就滿_null（已回滿）", () => {
    expect(staminaGauge(withRecover(200, 300, 3600), fetchedAt, new Date("2026-10-07T05:00:00Z")).fullAt).toBeNull();
    expect(staminaGauge(withRecover(300, 300, 0), fetchedAt, fetchedAt).fullAt).toBeNull();
  });
});
