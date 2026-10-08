import { describe, expect, it } from "vitest";
import { ICU_VARIANTS, simulateIcu } from "@/dev/icu-simulation";
import {
  formatTaipeiTime,
  interpretResponse,
  interpretSign,
  parseCheckinInfo,
  parseDailyNote,
  parseGameRoles,
  staminaFullAt,
} from "./responses";

describe("interpretResponse", () => {
  it("returns data when retcode is 0", () => {
    expect(interpretResponse({ retcode: 0, message: "OK", data: { a: 1 } })).toMatchObject({ ok: true, data: { a: 1 } });
  });

  it.each([-100, 10001])("flags retcode %i as an invalid cookie", (retcode) => {
    const result = interpretResponse({ retcode, message: "Please login", data: null });

    expect(result).toMatchObject({ ok: false, retcode, cookieInvalid: true });
    expect(!result.ok && result.message).toContain("重新登入");
  });

  it("carries other error codes and messages", () => {
    const result = interpretResponse({ retcode: 1008, message: "role not found" });

    expect(result).toMatchObject({ ok: false, retcode: 1008, cookieInvalid: false });
    expect(!result.ok && result.message).toContain("1008：role not found");
  });

  it("fails safely on an unexpected shape", () => {
    expect(interpretResponse("<html>")).toMatchObject({ ok: false, retcode: null, cookieInvalid: false });
  });
});

describe("parseGameRoles", () => {
  it("reads roles and skips entries without uid or region", () => {
    const roles = parseGameRoles({
      list: [
        { game_uid: "900000001", nickname: "開拓者", region: "prod_official_cht", region_name: "TW, HK, MO", level: 70 },
        { game_uid: "", region: "prod_official_asia" },
        { nickname: "no uid" },
      ],
    });

    expect(roles).toEqual([
      { uid: "900000001", nickname: "開拓者", region: "prod_official_cht", regionName: "TW, HK, MO", level: 70 },
    ]);
  });

  it("returns an empty list when list is missing", () => {
    expect(parseGameRoles(null)).toEqual([]);
  });
});

describe("parseDailyNote", () => {
  it("maps known fields, including the original 'epedition' spelling", () => {
    const note = parseDailyNote({
      current_stamina: 180,
      max_stamina: 240,
      stamina_recover_time: 21600,
      current_reserve_stamina: 2400,
      accepted_epedition_num: 4,
      total_expedition_num: 4,
      current_train_score: 500,
      max_train_score: 500,
      current_rogue_score: 14000,
      max_rogue_score: 14000,
      weekly_cocoon_cnt: 3,
      weekly_cocoon_limit: 3,
    });

    expect(note).toEqual({
      stamina: 180,
      maxStamina: 240,
      staminaRecoverSeconds: 21600,
      reserveStamina: 2400,
      expeditionsAccepted: 4,
      expeditionsTotal: 4,
      trainScore: 500,
      maxTrainScore: 500,
      rogueScore: 14000,
      maxRogueScore: 14000,
      cocoonRemaining: 3,
      cocoonLimit: 3,
    });
  });

  it("gives null for missing or malformed fields", () => {
    const note = parseDailyNote({ current_stamina: "abc", max_stamina: "240" });

    expect(note.stamina).toBeNull();
    expect(note.maxStamina).toBe(240);
    expect(note.cocoonLimit).toBeNull();
  });
});

describe("staminaFullAt", () => {
  const now = new Date("2026-10-07T04:00:00Z");

  it("adds the recover seconds to now", () => {
    const note = parseDailyNote({ stamina_recover_time: 3600 });

    expect(staminaFullAt(note, now)?.toISOString()).toBe("2026-10-07T05:00:00.000Z");
  });

  it("returns null when already full", () => {
    expect(staminaFullAt(parseDailyNote({ stamina_recover_time: 0 }), now)).toBeNull();
  });
});

describe("formatTaipeiTime", () => {
  // 台北 2026-10-07 12:00
  const now = new Date("2026-10-07T04:00:00Z");

  it("labels same-day times as today in Taipei time", () => {
    expect(formatTaipeiTime(new Date("2026-10-07T10:30:00Z"), now)).toBe("今天 18:30");
  });

  it("labels times after Taipei midnight as tomorrow", () => {
    expect(formatTaipeiTime(new Date("2026-10-07T17:05:00Z"), now)).toBe("明天 01:05");
  });

  it("labels times two Taipei days later with the date (stamina from 0 takes ~30 hours)", () => {
    // 台北 2026-10-09 02:00
    expect(formatTaipeiTime(new Date("2026-10-08T18:00:00Z"), now)).toBe("10/9 02:00");
  });

  it("counts days by the Taipei calendar across the new year", () => {
    // 台北 2026-12-31 20:00 看 2027-01-01 01:05
    expect(formatTaipeiTime(new Date("2026-12-31T17:05:00Z"), new Date("2026-12-31T12:00:00Z"))).toBe("明天 01:05");
  });

  it.each(ICU_VARIANTS)("gives the same text when ICU output differs ($name)", (variant) => {
    simulateIcu(variant);

    expect(formatTaipeiTime(new Date("2026-10-07T17:05:00Z"), now)).toBe("明天 01:05");
    expect(formatTaipeiTime(new Date("2026-10-08T18:00:00Z"), now)).toBe("10/9 02:00");
  });
});

describe("parseCheckinInfo", () => {
  it("reads sign status and total days", () => {
    expect(parseCheckinInfo({ is_sign: true, total_sign_day: 7 })).toEqual({ isSigned: true, totalSignDay: 7 });
  });

  it("gives null when fields are missing", () => {
    expect(parseCheckinInfo({})).toEqual({ isSigned: null, totalSignDay: null });
  });
});

describe("interpretSign", () => {
  it("treats retcode 0 without risk as success", () => {
    expect(interpretSign({ retcode: 0, message: "OK", data: { code: "ok" } })).toMatchObject({ result: "success" });
  });

  it("treats -5003 as already signed", () => {
    expect(interpretSign({ retcode: -5003, message: "already" })).toMatchObject({ result: "already", cookieInvalid: false });
  });

  it("fails when HoYoLAB asks for a captcha", () => {
    const outcome = interpretSign({ retcode: 0, message: "OK", data: { gt_result: { is_risk: true } } });

    expect(outcome.result).toBe("failed");
    expect(outcome.message).toContain("驗證碼");
  });

  it("propagates an invalid cookie", () => {
    expect(interpretSign({ retcode: -100, message: "not login" })).toMatchObject({ result: "failed", cookieInvalid: true });
  });
});
