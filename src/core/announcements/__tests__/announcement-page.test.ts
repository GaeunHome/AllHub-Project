import { beforeEach, describe, expect, it, vi } from "vitest";
import { requireSession, TEST_SESSION } from "@/dev/session-stub";
import { markup, mocksOf, textOf } from "@/dev/test-helpers";

vi.mock("@/core/auth", () => import("@/dev/session-stub"));
vi.mock("next/server", () => ({ connection: async () => {} }));
vi.mock("../cached", () => ({ cachedAnnouncements: vi.fn() }));

const cached = mocksOf(await import("../cached"), "cachedAnnouncements");
const { AnnouncementBody } = await import("../announcement-page");

const HOUR = 3_600_000;
const NOT_FOUND = "NEXT_HTTP_ERROR_FALLBACK;404";
const row = (values: Record<string, unknown>) => ({ id: 1, kind: "general", title: "公告", body: "", startsAt: null, endsAt: null, pinned: false, createdAt: new Date(), updatedAt: new Date(), ...values });
const body = (id: string) => AnnouncementBody({ params: Promise.resolve({ id }) });
const page = async (id: string) => markup(await body(id));
const announcementLinks = (html: string) => [...html.matchAll(/<a [^>]*href="(\/announcements\/[^"]*)"/g)].map(([, href]) => href);

beforeEach(() => {
  requireSession.mockReset().mockResolvedValue(TEST_SESSION);
  cached.cachedAnnouncements.mockReset();
});

describe("公告頁（使用者要的：首頁的公告點進去是一個頁面）", () => {
  it("要登入才讀公告", async () => {
    requireSession.mockRejectedValue(new Error("NEXT_REDIRECT:/login"));

    await expect(body("1")).rejects.toThrow("NEXT_REDIRECT");
    expect(cached.cachedAnnouncements).not.toHaveBeenCalled();
  });

  it("寫出種類、標題（頁面的大標題）、時間與內文；內文的換行照原樣留著", async () => {
    // 台北時間 11/11 22:00 到 23:00
    cached.cachedAnnouncements.mockResolvedValue([
      row({ id: 3, kind: "maintenance", title: "網站更新（不停機）", body: "更新期間照常可以用。\n畫面怪怪的就重新整理。", startsAt: new Date("2026-11-11T14:00:00Z"), endsAt: new Date(Date.now() + HOUR) }),
    ]);

    const html = await page("3");
    const text = textOf(html, { spaced: true });

    expect(html).toMatch(/<h1[^>]*>網站更新（不停機）<\/h1>/);
    expect(text).toContain("不停機維護");
    expect(text).toContain("11/11 22:00");
    expect(html).toContain("更新期間照常可以用。\n畫面怪怪的就重新整理。");
  });

  // 使用者選的站長來信 原本的漸層橫幅與上緣色條看起來像樣板
  it("站長來信：最後是站長署名，上面有回首頁公告清單的連結；不再用漸層橫幅", async () => {
    cached.cachedAnnouncements.mockResolvedValue([row({ id: 1, title: "新功能" })]);

    const html = await page("1");

    expect(textOf(html, { spaced: true })).toMatch(/站長\s/);
    expect(html).toMatch(/<a [^>]*href="\/#home-announcements"/);
    expect(html).not.toContain("page-banner");
  });

  it("維護還沒開始：寫還有幾天開始與公布、開始、結束三步；沒寫時間的一般公告沒有時間軸", async () => {
    cached.cachedAnnouncements.mockResolvedValue([
      row({ id: 1, kind: "maintenance", title: "下週維護", startsAt: new Date(Date.now() + 49 * HOUR), endsAt: new Date(Date.now() + 51 * HOUR) }),
      row({ id: 2, title: "新功能" }),
    ]);

    const steps = (html: string) => [...html.matchAll(/<li[^>]*data-state="(\w+)"[^>]*>/g)].map(([, state]) => state);
    const upcoming = await page("1");

    expect(textOf(upcoming)).toContain("還有 2 天開始");
    expect(steps(upcoming)).toEqual(["done", "next", "later"]);
    expect(steps(await page("2"))).toEqual([]);
  });

  it("還沒開始的維護也看得到（跟首頁一樣，才來得及知道）", async () => {
    cached.cachedAnnouncements.mockResolvedValue([row({ id: 1, kind: "maintenance", title: "下週維護", startsAt: new Date(Date.now() + 48 * HOUR) })]);

    expect(textOf(await page("1"))).toContain("下週維護");
  });

  it("刪掉的（不在了）與結束時間過了的：找不到頁面", async () => {
    cached.cachedAnnouncements.mockResolvedValue([row({ id: 1, endsAt: new Date(Date.now() - HOUR) })]);

    await expect(body("1")).rejects.toThrow(NOT_FOUND);
    await expect(body("2")).rejects.toThrow(NOT_FOUND);
  });

  it.each(["abc", "0", "-1", "1.5", "01"])("網址的編號是 %s：找不到頁面", async (id) => {
    cached.cachedAnnouncements.mockResolvedValue([row({ id: 1 })]);

    await expect(body(id)).rejects.toThrow(NOT_FOUND);
  });

  it("其他還在的公告列在這一則下面，停止服務排前面，點了到各自的頁面；結束的不列", async () => {
    cached.cachedAnnouncements.mockResolvedValue([
      row({ id: 1, title: "這一則" }),
      row({ id: 2, title: "新功能" }),
      row({ id: 3, kind: "outage", title: "資料庫升級" }),
      row({ id: 4, title: "舊的", endsAt: new Date(Date.now() - HOUR) }),
    ]);

    expect(announcementLinks(await page("1"))).toEqual(["/announcements/3", "/announcements/2"]);
  });

  it("只有這一則時不列其他公告", async () => {
    cached.cachedAnnouncements.mockResolvedValue([row({ id: 1, title: "這一則" })]);

    const html = await page("1");

    expect(announcementLinks(html)).toEqual([]);
    expect(textOf(html)).not.toContain("其他公告");
  });
});
