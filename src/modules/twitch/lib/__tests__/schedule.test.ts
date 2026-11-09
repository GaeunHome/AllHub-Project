import { describe, expect, it } from "vitest";
import { nextStartText, parseSchedule, segmentTime, upcomingSegments, vacationText } from "../schedule";

// 照 Twitch 的 Scheduling Broadcasts 指南的回應格式 時間是 UTC
const segment = (id: string, start: string, end: string | null, extra: Record<string, unknown> = {}) => ({ id, start_time: start, end_time: end, title: "", canceled_until: null, category: null, is_recurring: false, ...extra });
const RESPONSE = {
  data: {
    segments: [
      segment("past", "2026-11-09T12:00:00Z", "2026-11-09T15:00:00Z"),
      segment("tonight", "2026-11-10T12:00:00Z", "2026-11-10T15:00:00Z", { title: "一起玩新作", category: { id: "27471", name: "Minecraft" } }),
      segment("canceled", "2026-11-11T12:00:00Z", "2026-11-11T15:00:00Z", { canceled_until: "2026-11-11T15:00:00Z" }),
      segment("friday", "2026-11-13T06:00:00Z", "2026-11-13T10:00:00Z", { title: "聊天" }),
      segment("vacation", "2026-11-17T12:00:00Z", "2026-11-17T15:00:00Z"),
      segment("later", "2026-11-21T12:00:00Z", null),
    ],
    broadcaster_id: "141981764",
    broadcaster_name: "TwitchDev",
    broadcaster_login: "twitchdev",
    vacation: { start_time: "2026-11-16T00:00:00Z", end_time: "2026-11-20T00:00:00Z" },
  },
  pagination: {},
};
// 台北 11/10 星期二中午
const NOW = new Date("2026-11-10T04:00:00Z");
const parsed = () => parseSchedule(RESPONSE)!.schedule;

describe("parseSchedule：主播的開台時間表", () => {
  it("取消的與休假期間的不算，遊戲寫名稱，沒有結束時間的留 null", () => {
    expect(parsed()).toEqual({
      segments: [
        { start: "2026-11-09T12:00:00.000Z", end: "2026-11-09T15:00:00.000Z", title: null, category: null },
        { start: "2026-11-10T12:00:00.000Z", end: "2026-11-10T15:00:00.000Z", title: "一起玩新作", category: "Minecraft" },
        { start: "2026-11-13T06:00:00.000Z", end: "2026-11-13T10:00:00.000Z", title: "聊天", category: null },
        { start: "2026-11-21T12:00:00.000Z", end: null, title: null, category: null },
      ],
      vacation: { start: "2026-11-16T00:00:00.000Z", end: "2026-11-20T00:00:00.000Z" },
    });
  });

  it("有時間表但都沒排（segments 是 null）：空的，不算格式不同", () => {
    expect(parseSchedule({ data: { segments: null, vacation: null } })).toEqual({ schedule: { segments: [], vacation: null }, missing: [] });
  });

  it("少了開始時間的那次略過並記下欄位；沒有 data 是格式不同", () => {
    const result = parseSchedule({ data: { segments: [{ id: "x", title: "沒有時間" }], vacation: null } });

    expect(result).toEqual({ schedule: { segments: [], vacation: null }, missing: ["data.segments[].start_time"] });
    expect(parseSchedule({ message: "Not Found" })).toBeNull();
  });
});

describe("畫面上的時間：一律台北時間", () => {
  it("還沒結束的才列，照時間排，最多幾次", () => {
    expect(upcomingSegments(parsed(), NOW).map(({ title }) => title)).toEqual(["一起玩新作", "聊天", null]);
    expect(upcomingSegments(parsed(), NOW, 1)).toHaveLength(1);
  });

  it("清單上的下次開台：今天、明天、一週內寫星期，再遠寫日期", () => {
    expect(nextStartText("2026-11-10T12:00:00Z", NOW)).toBe("今天 20:00");
    expect(nextStartText("2026-11-11T01:00:00Z", NOW)).toBe("明天 09:00");
    expect(nextStartText("2026-11-13T06:00:00Z", NOW)).toBe("週五 14:00");
    expect(nextStartText("2026-11-21T12:00:00Z", NOW)).toBe("11/21 20:00");
  });

  it("詳情的每一次：日期星期加開始到結束，沒有結束時間寫開始", () => {
    const [tonight, , later] = upcomingSegments(parsed(), NOW);

    expect(segmentTime(tonight)).toBe("11/10（二）20:00–23:00");
    expect(segmentTime(later)).toBe("11/21（六）20:00 開始");
  });

  it("休假寫起訖的日期", () => {
    expect(vacationText(parsed().vacation!)).toBe("休假：11/16 到 11/20");
  });
});
