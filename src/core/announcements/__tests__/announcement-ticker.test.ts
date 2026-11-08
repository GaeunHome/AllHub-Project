import { createElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { requireSession, TEST_SESSION } from "@/dev/session-stub";
import { markup, mocksOf, textOf } from "@/dev/test-helpers";

vi.mock("@/core/auth", () => import("@/dev/session-stub"));
vi.mock("next/server", () => ({ connection: async () => {} }));
vi.mock("../cached", () => ({ cachedAnnouncements: vi.fn() }));

const cached = mocksOf(await import("../cached"), "cachedAnnouncements");
const { AnnouncementTicker } = await import("../announcement-ticker");

const HOUR = 3_600_000;
const row = (values: Record<string, unknown>) => ({ id: 1, kind: "general", title: "公告", body: "", startsAt: null, endsAt: null, pinned: false, createdAt: new Date(), updatedAt: new Date(), ...values });

beforeEach(() => {
  requireSession.mockReset().mockResolvedValue(TEST_SESSION);
  cached.cachedAnnouncements.mockReset();
});

describe("全站導覽列上面的跑馬燈", () => {
  it("要登入才讀公告", async () => {
    requireSession.mockRejectedValue(new Error("NEXT_REDIRECT:/login"));

    await expect(AnnouncementTicker()).rejects.toThrow("NEXT_REDIRECT");
    expect(cached.cachedAnnouncements).not.toHaveBeenCalled();
  });

  it("只有沒置頂的一般公告時整條不出現", async () => {
    cached.cachedAnnouncements.mockResolvedValue([row({ title: "新功能上線" })]);

    expect(await AnnouncementTicker()).toBeNull();
  });

  it("寫出種類、標題與時間，點了到首頁的公告欄，右邊可以關掉", async () => {
    cached.cachedAnnouncements.mockResolvedValue([row({ kind: "outage", title: "資料庫升級", startsAt: new Date(Date.now() + HOUR) })]);

    const element = await AnnouncementTicker();
    const html = markup(element && createElement(() => element));

    expect(textOf(html, { spaced: true })).toContain("停止服務 資料庫升級");
    expect(html).toContain('href="/#home-announcements"');
    expect(html).toContain('aria-label="關閉跑馬燈"');
  });
});
