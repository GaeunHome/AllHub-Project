import { describe, expect, it } from "vitest";
import { announcementTimeline, announcementWhen, dateTimeInputValue, inTicker, isAnnouncementShown, parseAnnouncement } from "../rules";

const fields = (values: Partial<Record<"kind" | "title" | "body" | "startsAt" | "endsAt" | "pinned", string>> = {}) => ({ kind: "outage", title: "資料庫維護", body: "", startsAt: "", endsAt: "", pinned: "", ...values });

describe("parseAnnouncement（站長填的公告）", () => {
  it("只有種類與標題是必填，開始與結束都可以不填", () => {
    expect(parseAnnouncement(fields({ kind: "general", title: "  新功能上線 " }))).toEqual({ ok: true, value: { kind: "general", title: "新功能上線", body: "", startsAt: null, endsAt: null, pinned: false } });
  });

  it("勾了置頂到跑馬燈才置頂", () => {
    expect(parseAnnouncement(fields({ pinned: "true" }))).toMatchObject({ ok: true, value: { pinned: true } });
    expect(parseAnnouncement(fields({ pinned: "" }))).toMatchObject({ ok: true, value: { pinned: false } });
  });

  it("時間照台北時間算：表單的 2026-11-10T02:00 是 UTC 前一天 18:00", () => {
    const parsed = parseAnnouncement(fields({ startsAt: "2026-11-10T02:00", endsAt: "2026-11-10T04:30" }));

    expect(parsed).toMatchObject({ ok: true, value: { startsAt: new Date("2026-11-09T18:00:00Z"), endsAt: new Date("2026-11-09T20:30:00Z") } });
  });

  it.each([
    ["種類不在清單裡", { kind: "constructor" }, "請選擇公告的種類"],
    ["標題空白", { title: "   " }, "請填標題"],
    ["標題太長", { title: "字".repeat(61) }, "標題最多 60 字"],
    ["內文太長", { body: "字".repeat(2001) }, "內文最多 2000 字"],
    ["2 月 30 日", { startsAt: "2026-02-30T10:00" }, "開始時間不正確"],
    ["亂寫的時間", { endsAt: "明天" }, "結束時間不正確"],
    ["24 點", { endsAt: "2026-11-10T24:00" }, "結束時間不正確"],
    ["結束不晚於開始", { startsAt: "2026-11-10T04:00", endsAt: "2026-11-10T04:00" }, "結束時間要晚於開始時間"],
  ])("%s_拒絕", (_name, values, error) => {
    expect(parseAnnouncement(fields(values))).toEqual({ ok: false, error });
  });
});

describe("isAnnouncementShown（結束時間過了自動不顯示）", () => {
  const now = new Date("2026-11-10T00:00:00Z");

  it("沒有結束時間的一直顯示", () => {
    expect(isAnnouncementShown({ endsAt: null }, now)).toBe(true);
  });

  it("結束時間還沒到才顯示，剛好到的那一刻就不顯示", () => {
    expect(isAnnouncementShown({ endsAt: new Date("2026-11-10T00:00:01Z") }, now)).toBe(true);
    expect(isAnnouncementShown({ endsAt: now }, now)).toBe(false);
  });
});

describe("inTicker（使用者要的：最重要的與站長置頂的放在全站最上面的跑馬燈）", () => {
  const now = new Date("2026-11-10T00:00:00Z");
  const at = (iso: string) => new Date(iso);
  type Kind = "outage" | "maintenance" | "general";
  const shown = (kind: Kind, startsAt: Date | null, { endsAt = null as Date | null, pinned = false } = {}) => inTicker({ kind, startsAt, endsAt, pinned }, now);

  it("停止服務兩天後開始就放；剛好三天也放，多一分鐘還不用", () => {
    expect(shown("outage", at("2026-11-12T00:00:00Z"))).toBe(true);
    expect(shown("outage", at("2026-11-13T00:00:00Z"))).toBe(true);
    expect(shown("outage", at("2026-11-13T00:01:00Z"))).toBe(false);
  });

  it("維護正在進行要放，沒寫開始時間的當成已經開始", () => {
    expect(shown("maintenance", at("2026-11-09T23:00:00Z"), { endsAt: at("2026-11-10T03:00:00Z") })).toBe(true);
    expect(shown("maintenance", null)).toBe(true);
  });

  it("一般公告要站長置頂才放；置頂的停止服務提早一週也放", () => {
    expect(shown("general", null)).toBe(false);
    expect(shown("general", null, { pinned: true })).toBe(true);
    expect(shown("outage", at("2026-11-17T00:00:00Z"), { pinned: true })).toBe(true);
  });

  it("結束了就拿掉，置頂的也一樣", () => {
    expect(shown("outage", at("2026-11-09T20:00:00Z"), { endsAt: now })).toBe(false);
    expect(shown("general", null, { endsAt: now, pinned: true })).toBe(false);
  });
});

describe("announcementWhen（列上寫的時間，台北時間）", () => {
  const createdAt = new Date("2026-11-07T04:00:00Z");

  it("同一天的開始到結束只寫一次日期", () => {
    expect(announcementWhen({ createdAt, startsAt: new Date("2026-11-09T18:00:00Z"), endsAt: new Date("2026-11-09T20:30:00Z") })).toBe("11/10 02:00–04:30");
  });

  it("跨日的兩邊都寫日期", () => {
    expect(announcementWhen({ createdAt, startsAt: new Date("2026-11-09T18:00:00Z"), endsAt: new Date("2026-11-10T18:00:00Z") })).toBe("11/10 02:00–11/11 02:00");
  });

  it("只有開始、只有結束、都沒有", () => {
    expect(announcementWhen({ createdAt, startsAt: new Date("2026-11-09T18:00:00Z"), endsAt: null })).toBe("11/10 02:00 起");
    expect(announcementWhen({ createdAt, startsAt: null, endsAt: new Date("2026-11-09T20:30:00Z") })).toBe("到 11/10 04:30");
    expect(announcementWhen({ createdAt, startsAt: null, endsAt: null })).toBe("11/7 發布");
  });
});

describe("dateTimeInputValue（修改時帶回表單）", () => {
  it("台北時間的 YYYY-MM-DDTHH:mm，存下去再讀出來一樣", () => {
    const value = dateTimeInputValue(new Date("2026-11-09T18:00:00Z"));

    expect(value).toBe("2026-11-10T02:00");
    expect(parseAnnouncement(fields({ startsAt: value }))).toMatchObject({ ok: true, value: { startsAt: new Date("2026-11-09T18:00:00Z") } });
  });
});

describe("announcementTimeline（使用者選的站長來信：有開始或結束時間的公告畫公布、開始、結束三步）", () => {
  // 11/11 14:00 公布 維護在 11/15 凌晨 2:00 到 4:00 都是台北時間
  const created = new Date("2026-11-11T06:00:00Z");
  const starts = new Date("2026-11-14T18:00:00Z");
  const ends = new Date("2026-11-14T20:00:00Z");
  const row = (values: { startsAt?: Date | null; endsAt?: Date | null } = {}) => ({ createdAt: created, startsAt: starts, endsAt: ends, ...values });
  const at = (iso: string) => new Date(iso);

  it("沒寫開始也沒寫結束_不畫", () => {
    expect(announcementTimeline(row({ startsAt: null, endsAt: null }), created)).toBeNull();
  });

  it("還沒開始_公布那一步做完了、下一步是開始，寫還有幾天開始", () => {
    expect(announcementTimeline(row(), at("2026-11-11T08:00:00Z"))).toEqual({
      status: "還有 3 天開始",
      steps: [
        { label: "公布", time: "11/11 14:00", state: "done" },
        { label: "開始", time: "11/15 02:00", state: "next" },
        { label: "結束", time: "11/15 04:00", state: "later" },
      ],
    });
  });

  it("一天內開始寫幾小時、一小時內寫幾分鐘（不到一分鐘也寫 1 分鐘）", () => {
    expect(announcementTimeline(row(), at("2026-11-14T12:30:00Z"))?.status).toBe("還有 5 小時開始");
    expect(announcementTimeline(row(), at("2026-11-14T17:40:00Z"))?.status).toBe("還有 20 分鐘開始");
    expect(announcementTimeline(row(), at("2026-11-14T17:59:30Z"))?.status).toBe("還有 1 分鐘開始");
  });

  it("開始了還沒結束_進行中，開始做完了、下一步是結束", () => {
    expect(announcementTimeline(row(), at("2026-11-14T18:30:00Z"))).toEqual({
      status: "進行中",
      steps: [
        { label: "公布", time: "11/11 14:00", state: "done" },
        { label: "開始", time: "11/15 02:00", state: "done" },
        { label: "結束", time: "11/15 04:00", state: "next" },
      ],
    });
  });

  it("只寫結束時間的當成已經開始（跟跑馬燈一樣）；只寫開始時間的沒有結束那一步", () => {
    expect(announcementTimeline(row({ startsAt: null }), created)).toEqual({
      status: "進行中",
      steps: [
        { label: "公布", time: "11/11 14:00", state: "done" },
        { label: "結束", time: "11/15 04:00", state: "next" },
      ],
    });
    expect(announcementTimeline(row({ endsAt: null }), created)?.steps.map((step) => step.label)).toEqual(["公布", "開始"]);
  });
});
