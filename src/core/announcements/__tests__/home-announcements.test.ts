import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { requireSession, TEST_SESSION } from "@/dev/session-stub";
import { markup, mocksOf, textOf } from "@/dev/test-helpers";

vi.mock("@/core/auth", () => import("@/dev/session-stub"));
vi.mock("next/server", () => ({ connection: async () => {} }));
vi.mock("../cached", () => ({ cachedAnnouncements: vi.fn() }));

const cached = mocksOf(await import("../cached"), "cachedAnnouncements");
const { HomeAnnouncements } = await import("../home-announcements");

const DAY = 86_400_000;
const row = (values: Record<string, unknown>) => ({ id: 1, kind: "general", title: "公告", body: "", startsAt: null, endsAt: null, createdAt: new Date(), updatedAt: new Date(), ...values });

beforeEach(() => {
  requireSession.mockResolvedValue(TEST_SESSION);
  cached.cachedAnnouncements.mockReset();
});

describe("首頁最下面的公告", () => {
  it("沒有公告時整區不出現", async () => {
    cached.cachedAnnouncements.mockResolvedValue([]);

    expect(await HomeAnnouncements()).toBeNull();
  });

  it("只剩結束時間過了的公告時整區也不出現：過了就自動不顯示，不用等站長刪", async () => {
    cached.cachedAnnouncements.mockResolvedValue([row({ endsAt: new Date(Date.now() - DAY) })]);

    expect(await HomeAnnouncements()).toBeNull();
  });

  it("還沒開始的維護也要看得到，才來得及知道", async () => {
    cached.cachedAnnouncements.mockResolvedValue([row({ title: "週日停機", kind: "outage", startsAt: new Date(Date.now() + DAY) })]);

    const text = textOf(markup(await HomeAnnouncements()));

    expect(text).toContain("週日停機");
    expect(text).toContain("停止服務");
  });

  it("停止服務排最前面，同一種照原本的新舊順序", async () => {
    cached.cachedAnnouncements.mockResolvedValue([
      row({ id: 1, title: "新功能", kind: "general" }),
      row({ id: 2, title: "換模型", kind: "maintenance" }),
      row({ id: 3, title: "凌晨停機", kind: "outage" }),
      row({ id: 4, title: "另一則更新", kind: "general" }),
    ]);

    const text = textOf(markup(await HomeAnnouncements()));

    expect(["凌晨停機", "換模型", "新功能", "另一則更新"].map((title) => text.indexOf(title))).toEqual(["凌晨停機", "換模型", "新功能", "另一則更新"].map((title) => text.indexOf(title)).toSorted((a, b) => a - b));
  });

  it("標題列的場景圖放在靜態資料夾，不向外面載入", async () => {
    cached.cachedAnnouncements.mockResolvedValue([row({})]);

    const src = /\/images\/scenes\/[\w-]+\.svg/.exec(markup(await HomeAnnouncements()))?.[0] ?? "";

    expect(existsSync(join(process.cwd(), "public", src)) && src !== "").toBe(true);
    expect(readFileSync(join(process.cwd(), "public", src), "utf8").replaceAll("http://www.w3.org/2000/svg", "")).not.toMatch(/https?:|<script|<image/);
  });

  it("每一則都是連結，點了到那則公告的頁面（使用者要的：點進去是一個頁面）；首頁不放內文", async () => {
    cached.cachedAnnouncements.mockResolvedValue([row({ id: 1, title: "有內文", body: "早上會暫停十分鐘" }), row({ id: 2, title: "沒內文" })]);

    const html = markup(await HomeAnnouncements());

    expect([...html.matchAll(/<a [^>]*href="([^"]*)"/g)].map(([, href]) => href)).toEqual(["/announcements/1", "/announcements/2"]);
    expect(html).not.toContain("<details");
    expect(textOf(html)).not.toContain("早上會暫停十分鐘");
    expect(textOf(html)).toContain("沒內文");
  });
});
