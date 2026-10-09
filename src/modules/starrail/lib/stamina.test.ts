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

describe("staminaAlertAction", () => {
  it("alerts when reaching the threshold for the first time", () => {
    expect(staminaAlertAction(note(220), null, false)).toBe("alert");
  });

  it("stays quiet while still above the threshold after alerting", () => {
    expect(staminaAlertAction(note(240), null, true)).toBe("none");
  });

  it("resets once stamina drops below the threshold", () => {
    expect(staminaAlertAction(note(100), null, true)).toBe("reset");
  });

  it("does nothing below the threshold when not alerted", () => {
    expect(staminaAlertAction(note(219), null, false)).toBe("none");
  });

  it("does nothing when stamina is unknown", () => {
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
