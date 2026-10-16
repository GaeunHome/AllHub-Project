import { describe, expect, it } from "vitest";
import type { CalendarChallenge } from "./calendar";
import type { DailyNote } from "./responses";
import { dailyTrainingReminder, endgameCheckDue, endgamePeriod, endgameReminders, nextReset, serverOffsetHours, weeklyReminder } from "./reminders";

// 伺服器時區是使用者的決定 亞服與台港澳服 UTC+8 美服 UTC−5 歐服 UTC+1
// 每天 04:00 重置 週一 04:00 換週 2026-10-18 是星期日
const note = (overrides: Partial<DailyNote> = {}): DailyNote => ({
  stamina: 100, maxStamina: 300, staminaRecoverSeconds: 0, reserveStamina: 0, expeditionsAccepted: 4, expeditionsTotal: 4,
  trainScore: 300, maxTrainScore: 500, rogueScore: 8000, maxRogueScore: 14000, cocoonRemaining: 2, cocoonLimit: 3,
  ...overrides,
});
const at = (iso: string) => new Date(iso);

describe("serverOffsetHours：伺服器的時區", () => {
  it.each([
    ["prod_official_cht", 8],
    ["prod_official_asia", 8],
    ["prod_official_usa", -5],
    ["prod_official_eur", 1],
  ])("%s_UTC%i", (region, hours) => {
    expect(serverOffsetHours(region)).toBe(hours);
  });
});

describe("nextReset：下一次 04:00 重置（伺服器當地時間）", () => {
  it("台港澳服晚上九點（UTC 13:00）_隔天 04:00（UTC 20:00）；凌晨三點_當天 04:00", () => {
    expect(nextReset("prod_official_cht", at("2026-10-15T13:00:00Z"))).toEqual(at("2026-10-15T20:00:00Z"));
    expect(nextReset("prod_official_cht", at("2026-10-15T19:00:00Z"))).toEqual(at("2026-10-15T20:00:00Z"));
  });

  it("美服 04:00 是 UTC 09:00；歐服 04:00 是 UTC 03:00", () => {
    expect(nextReset("prod_official_usa", at("2026-10-16T02:00:00Z"))).toEqual(at("2026-10-16T09:00:00Z"));
    expect(nextReset("prod_official_eur", at("2026-10-15T20:00:00Z"))).toEqual(at("2026-10-16T03:00:00Z"));
  });
});

describe("dailyTrainingReminder：晚上九點（伺服器當地）每日實訓還沒做完", () => {
  it("台港澳服 21:00（UTC 13:00）還差_提醒，期別是當地日期", () => {
    expect(dailyTrainingReminder(note(), "prod_official_cht", at("2026-10-15T13:00:00Z"))).toEqual({ period: "2026-10-15", score: 300, max: 500, resetAt: at("2026-10-15T20:00:00Z") });
  });

  it("20:59 還不提醒；做完了（500/500）或讀不到分數也不提醒", () => {
    expect(dailyTrainingReminder(note(), "prod_official_cht", at("2026-10-15T12:59:00Z"))).toBeNull();
    expect(dailyTrainingReminder(note({ trainScore: 500 }), "prod_official_cht", at("2026-10-15T13:00:00Z"))).toBeNull();
    expect(dailyTrainingReminder(note({ trainScore: null }), "prod_official_cht", at("2026-10-15T13:00:00Z"))).toBeNull();
  });

  it("美服的 21:00 是 UTC 隔天 02:00：期別還是當地的那一天", () => {
    expect(dailyTrainingReminder(note(), "prod_official_usa", at("2026-10-16T01:59:00Z"))).toBeNull();
    expect(dailyTrainingReminder(note(), "prod_official_usa", at("2026-10-16T02:00:00Z"))).toMatchObject({ period: "2026-10-15", resetAt: at("2026-10-16T09:00:00Z") });
  });

  it("歐服的 21:00 是 UTC 20:00", () => {
    expect(dailyTrainingReminder(note(), "prod_official_eur", at("2026-10-15T20:00:00Z"))).toMatchObject({ period: "2026-10-15" });
    expect(dailyTrainingReminder(note(), "prod_official_eur", at("2026-10-15T19:59:00Z"))).toBeNull();
  });
});

describe("weeklyReminder：週日傍晚（週一 04:00 換週前）模擬宇宙積分沒滿或歷戰餘響還有次數", () => {
  const sundayEvening = at("2026-10-18T10:00:00Z"); // 台港澳服週日 18:00

  it("兩項都沒做完_都列出來，期別是那個週日，重置在週一 04:00", () => {
    expect(weeklyReminder(note(), "prod_official_cht", sundayEvening)).toEqual({
      period: "2026-10-18",
      rogue: { score: 8000, max: 14000 },
      cocoon: { remaining: 2, limit: 3 },
      resetAt: at("2026-10-18T20:00:00Z"),
    });
  });

  it("只剩歷戰餘響_只列它；都做完了_不提醒", () => {
    expect(weeklyReminder(note({ rogueScore: 14000 }), "prod_official_cht", sundayEvening)).toMatchObject({ rogue: null, cocoon: { remaining: 2 } });
    expect(weeklyReminder(note({ rogueScore: 14000, cocoonRemaining: 0 }), "prod_official_cht", sundayEvening)).toBeNull();
  });

  it("週日 17:59、週六晚上都不提醒", () => {
    expect(weeklyReminder(note(), "prod_official_cht", at("2026-10-18T09:59:00Z"))).toBeNull();
    expect(weeklyReminder(note(), "prod_official_cht", at("2026-10-17T12:00:00Z"))).toBeNull();
  });

  it("美服的週日 18:00 是 UTC 週日 23:00", () => {
    expect(weeklyReminder(note(), "prod_official_usa", at("2026-10-18T22:59:00Z"))).toBeNull();
    expect(weeklyReminder(note(), "prod_official_usa", at("2026-10-18T23:00:00Z"))).toMatchObject({ period: "2026-10-18", resetAt: at("2026-10-19T09:00:00Z") });
  });
});

describe("endgameReminders：終局挑戰還剩一到兩天、進度沒滿", () => {
  const NOW = at("2026-10-17T10:00:00Z"); // 台港澳服週六 18:00
  const challenge = (hoursLeft: number, overrides: Partial<CalendarChallenge> = {}): CalendarChallenge => ({
    id: 1, kind: "chaos", name: "永恆的信條", status: "ongoing", current: 24, total: 36,
    startsAt: NOW.getTime() - 30 * 86_400_000, endsAt: NOW.getTime() + hoursLeft * 3_600_000,
    ...overrides,
  });

  it("週一 04:00 結束、週六傍晚還剩 34 小時、24/36_提醒", () => {
    expect(endgameReminders([challenge(34)], NOW)).toHaveLength(1);
  });

  it("剛好剩 48 小時要提醒；超過 48 小時、剩 24 小時以內都不提醒（一期只在這一天提醒一次）", () => {
    expect(endgameReminders([challenge(48)], NOW)).toHaveLength(1);
    expect(endgameReminders([challenge(49)], NOW)).toEqual([]);
    expect(endgameReminders([challenge(24)], NOW)).toEqual([]);
    expect(endgameReminders([challenge(10)], NOW)).toEqual([]);
  });

  it("拿滿了、狀態是已完成或還沒開放、總數讀不到都不提醒", () => {
    expect(endgameReminders([challenge(34, { current: 36 })], NOW)).toEqual([]);
    expect(endgameReminders([challenge(34, { status: "finished" })], NOW)).toEqual([]);
    expect(endgameReminders([challenge(34, { status: "unopened" })], NOW)).toEqual([]);
    expect(endgameReminders([challenge(34, { total: 0 })], NOW)).toEqual([]);
  });

  it("同一期的辨認：類型、編號與結束時間都一樣才是同一期", () => {
    expect(endgamePeriod(challenge(34))).toBe(endgamePeriod(challenge(34)));
    expect(endgamePeriod(challenge(34))).not.toBe(endgamePeriod(challenge(34, { kind: "fiction" })));
    expect(endgamePeriod(challenge(34))).not.toBe(endgamePeriod(challenge(35)));
  });
});

describe("endgameCheckDue：傍晚六點（伺服器當地）以後才查活動日曆", () => {
  it("台港澳服 17:59 不查、18:00 查；美服的 18:00 是 UTC 23:00", () => {
    expect(endgameCheckDue("prod_official_cht", at("2026-10-17T09:59:00Z"))).toBe(false);
    expect(endgameCheckDue("prod_official_cht", at("2026-10-17T10:00:00Z"))).toBe(true);
    expect(endgameCheckDue("prod_official_usa", at("2026-10-17T22:59:00Z"))).toBe(false);
    expect(endgameCheckDue("prod_official_usa", at("2026-10-17T23:00:00Z"))).toBe(true);
  });
});
