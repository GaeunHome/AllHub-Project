import { describe, expect, it } from "vitest";
import { deleteDateOf, parseItem, parseShortText, parseTrip, tripDays } from "../rules";

const TRIP = { title: "  京都  五日遊 ", destination: "京都", startDate: "2026-12-01", endDate: "2026-12-05" };
const ITEM = { kind: "place", title: "清水寺", mapsUrl: "", note: "", stayMinutes: "90", travelMinutes: "20", fixedTime: "" };

describe("旅程", () => {
  it("名稱整理空白；目的地可以不填", () => {
    expect(parseTrip(TRIP)).toEqual({ ok: true, value: { title: "京都 五日遊", destination: "京都", startDate: "2026-12-01", endDate: "2026-12-05" } });
    expect(parseTrip({ ...TRIP, destination: " " })).toMatchObject({ ok: true, value: { destination: null } });
  });

  it.each([
    ["沒有名稱", { title: " " }, "請填旅程名稱"],
    ["名稱太長", { title: "好".repeat(41) }, "旅程名稱最多 40 字"],
    ["日期不存在", { startDate: "2026-02-30" }, "請選出發與回程的日期"],
    ["回程早於出發", { endDate: "2026-11-30" }, "回程不能早於出發"],
    ["超過 30 天", { endDate: "2027-01-01" }, "一趟最多 30 天"],
  ])("%s", (_name, change, error) => {
    expect(parseTrip({ ...TRIP, ...change })).toEqual({ ok: false, error });
  });

  it("emoji 算一個字：用 code point 算", () => {
    expect(parseTrip({ ...TRIP, title: "🗾".repeat(40) }).ok).toBe(true);
  });

  it("當天來回是一天；跨月照日曆算", () => {
    expect(tripDays("2026-12-01", "2026-12-01")).toEqual(["2026-12-01"]);
    expect(tripDays("2026-12-31", "2027-01-02")).toEqual(["2026-12-31", "2027-01-01", "2027-01-02"]);
    expect(tripDays("2028-02-28", "2028-03-01")).toEqual(["2028-02-28", "2028-02-29", "2028-03-01"]);
  });

  it("回程 7 天後刪：使用者要的", () => {
    expect(deleteDateOf("2026-12-05")).toBe("2026-12-12");
  });
});

describe("行程項目", () => {
  it("整理欄位：沒填的是 null，分鐘是數字", () => {
    expect(parseItem(ITEM)).toEqual({ ok: true, value: { kind: "place", title: "清水寺", mapsUrl: null, note: null, stayMinutes: 90, travelMinutes: 20, fixedTime: null } });
  });

  it("分鐘沒填當 0", () => {
    expect(parseItem({ ...ITEM, stayMinutes: "", travelMinutes: "" })).toMatchObject({ ok: true, value: { stayMinutes: 0, travelMinutes: 0 } });
  });

  it.each([
    ["種類不對", { kind: "boat" }, "請選種類"],
    ["沒有名稱", { title: " " }, "請填名稱"],
    ["不是 Google Maps 的連結", { mapsUrl: "https://evil.example.com/x" }, "請貼 Google Maps 的連結"],
    ["負的分鐘", { stayMinutes: "-5" }, "時間請填 0 到 1440 分鐘"],
    ["小數分鐘", { travelMinutes: "1.5" }, "時間請填 0 到 1440 分鐘"],
    ["超過一天", { stayMinutes: "1441" }, "時間請填 0 到 1440 分鐘"],
    ["固定時間格式不對", { fixedTime: "25:00" }, "固定時間的格式不對"],
    ["備註太長", { note: "長".repeat(301) }, "備註最多 300 字"],
  ])("%s", (_name, change, error) => {
    expect(parseItem({ ...ITEM, ...change })).toEqual({ ok: false, error });
  });
});

describe("短文字", () => {
  it("留言與清單項目都要有字、有長度上限", () => {
    expect(parseShortText(" 記得帶護照 ", "項目", 40)).toEqual({ ok: true, value: "記得帶護照" });
    expect(parseShortText(" ", "項目", 40)).toEqual({ ok: false, error: "請填項目" });
    expect(parseShortText("長".repeat(41), "項目", 40)).toEqual({ ok: false, error: "項目最多 40 字" });
  });
});
