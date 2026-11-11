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

const render = async () => {
  const element = await AnnouncementTicker();
  return markup(element && createElement(() => element));
};

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

  it("寫出種類、標題與時間，沒有連結（使用者要的：跑馬燈只要會跑，不用點），右邊可以關掉", async () => {
    cached.cachedAnnouncements.mockResolvedValue([row({ kind: "outage", title: "資料庫升級", startsAt: new Date(Date.now() + HOUR) })]);

    const html = await render();

    expect(textOf(html, { spaced: true })).toContain("停止服務 資料庫升級");
    expect(html).not.toContain("<a ");
    expect(html).toContain('aria-label="關閉跑馬燈"');
  });

  it("多則接成一條（使用者選的）：停止服務、維護、置頂的一般公告照順序，每一則前面有自己種類的圖示；整條的底色看最重要的那一則", async () => {
    cached.cachedAnnouncements.mockResolvedValue([
      row({ id: 1, title: "新功能上線", pinned: true }),
      row({ id: 2, kind: "maintenance", title: "網站更新", startsAt: new Date(Date.now() + HOUR) }),
      row({ id: 3, kind: "outage", title: "資料庫升級", startsAt: new Date(Date.now() + HOUR) }),
    ]);

    const html = await render();
    const items = [...html.matchAll(/<li [^>]*data-kind="(\w+)"[^>]*>(.*?)<\/li>/g)];
    const icons = items.map(([, , inner]) => /--icon-url:url\(&quot;([^&]+)&quot;\)/.exec(inner)?.[1]);

    expect(items.map(([, kind]) => kind)).toEqual(["outage", "maintenance", "general"]);
    expect(icons.every(Boolean) && new Set(icons).size).toBe(3);
    expect(html).toMatch(/<section [^>]*data-kind="outage"/);
  });
});
