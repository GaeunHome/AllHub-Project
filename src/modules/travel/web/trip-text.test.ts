import { describe, expect, it } from "vitest";
import type { TripItem } from "../service/trips";
import { dayText, tripText } from "./trip-text";
import type { DayView } from "./trip-view";

const item = (id: number, day: string | null, position: number, overrides: Partial<TripItem> = {}): TripItem => ({
  id,
  tripId: 1,
  day,
  position,
  kind: "place",
  title: `地點 ${id}`,
  mapsUrl: `https://maps.app.goo.gl/${id}`,
  lat: null,
  lng: null,
  note: null,
  stayMinutes: 60,
  travelMinutes: 30,
  fixedTime: null,
  version: 1,
  ...overrides,
});

const TRIP = { title: "京都賞楓", destination: "京都", startDate: "2026-11-20", endDate: "2026-11-21" };
const DAYS: DayView[] = [
  { date: "2026-11-20", label: "第 1 天", detail: "11 月 20 日 星期五", short: "11/20（五）" },
  { date: "2026-11-21", label: "第 2 天", detail: "11 月 21 日 星期六", short: "11/21（六）" },
];

describe("行程文字（貼到 LINE 給沒有帳號的親友看）", () => {
  it("整趟：標題 每一天 時間與地點 地點下面一行地圖連結", () => {
    const items = [item(1, "2026-11-20", 0), item(2, "2026-11-20", 1), item(3, "2026-11-21", 0)];

    // 09:00 到 停留 60 分鐘 走 30 分鐘 10:30 到第二站
    expect(tripText(TRIP, DAYS, items)).toBe(
      [
        "京都賞楓 11/20–11/21",
        "",
        "第 1 天 11/20（五）",
        "09:00 地點 1",
        "https://maps.app.goo.gl/1",
        "10:30 地點 2",
        "https://maps.app.goo.gl/2",
        "",
        "第 2 天 11/21（六）",
        "09:00 地點 3",
        "https://maps.app.goo.gl/3",
      ].join("\n"),
    );
  });

  it("單日：開頭寫旅程名稱 親友才知道是哪一趟", () => {
    expect(dayText(TRIP, DAYS[1], [item(3, "2026-11-21", 0)])).toBe(["京都賞楓 第 2 天 11/21（六）", "09:00 地點 3", "https://maps.app.goo.gl/3"].join("\n"));
  });

  it("還沒排進日期的想去的點不列", () => {
    expect(tripText(TRIP, DAYS, [item(1, null, 0), item(2, "2026-11-20", 0)])).not.toContain("地點 1");
  });

  it("備註不帶出去 避免把私人內容貼給別人", () => {
    expect(tripText(TRIP, DAYS, [item(1, "2026-11-20", 0, { note: "訂位代號 ABC123" })])).not.toContain("ABC123");
  });

  it("沒貼連結的地點用名稱與目的地查 親友一樣點得開", () => {
    const text = tripText(TRIP, DAYS, [item(1, "2026-11-20", 0, { mapsUrl: null, title: "清水寺" })]);

    const link = text.split("\n").find((line) => line.startsWith("https://"))!;
    expect(new URL(link).searchParams.get("query")).toBe("清水寺 京都");
  });

  it("交通與其他沒貼連結時不放連結 例如搭電車 查地圖沒有意義", () => {
    const text = tripText(TRIP, DAYS, [item(1, "2026-11-20", 0, { mapsUrl: null, kind: "transport", title: "搭 JR" })]);

    expect(text).toContain("09:00 搭 JR");
    expect(text).not.toContain("https://");
  });

  it("還沒排的那一天照樣列出 親友才不會以為少一天", () => {
    expect(tripText(TRIP, DAYS, [item(1, "2026-11-20", 0)])).toContain("第 2 天 11/21（六）\n還沒排行程");
  });

  it("當天來回的旅程只寫一個日期", () => {
    const day = { ...TRIP, endDate: "2026-11-20" };

    expect(tripText(day, [DAYS[0]], []).split("\n")[0]).toBe("京都賞楓 11/20");
  });
});
