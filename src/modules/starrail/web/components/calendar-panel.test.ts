import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { OTHER_SESSION, requireSession } from "@/dev/session-stub";
import { markup, mocksOf } from "@/dev/test-helpers";
import type { ActCalendar } from "../../lib/calendar";
import { accountView } from "../../dev/fixtures";

vi.mock("@/core/auth", () => import("@/dev/session-stub"));
vi.mock("../../service/cached", { spy: true });

const cached = mocksOf(await import("../../service/cached"), "cachedActCalendar");
const { CalendarPanel } = await import("./calendar-panel");

const account = accountView();
const DAY = 86_400_000;
const now = Date.now();
const span = (endDays: number) => ({ startsAt: now - 10 * DAY, endsAt: now + endDays * DAY });

const CALENDAR: ActCalendar = {
  version: "3.7",
  challenges: [
    { id: 1, kind: "chaos", name: "永恆的信條", status: "ongoing", current: 24, total: 36, ...span(20) },
    { id: 2, kind: "fiction", name: "飛光競逐", status: "ongoing", current: 8, total: 12, ...span(3.5) },
    { id: 3, kind: "shadow", name: "下一期", status: "unopened", current: 0, total: 12, startsAt: now + DAY, endsAt: now + 40 * DAY },
  ],
  events: [
    { id: 11, kind: "other", name: "以太戰線", current: 2, total: 10, ...span(9) },
    { id: 12, kind: "double", name: "花藏繁生", current: 1, total: 3, ...span(2) },
    { id: 13, kind: "other", name: "常駐活動", current: 0, total: 0, startsAt: null, endsAt: null },
  ],
  warps: [
    {
      id: "4001",
      kind: "character",
      name: "蝶立鋒鍔",
      ...span(11),
      items: [
        { id: "1001", name: "三月七", icon: "https://act-webstatic.hoyoverse.com/a/1001.png", rarity: 4 },
        { id: "1308", name: "黃泉", icon: "https://act-webstatic.hoyoverse.com/a/1308.png", rarity: 5 },
      ],
    },
  ],
};

const html = async () => markup((await CalendarPanel({ account })) as ReactElement);

beforeEach(() => {
  requireSession.mockReset();
  cached.cachedActCalendar.mockReset().mockResolvedValue({ ok: true, calendar: CALENDAR, fetchedAt: new Date(now) });
  // 開發時圖片網址改寫到假伺服器 每個測試前 vitest-setup 會先清掉
  vi.stubEnv("DEV_EXTERNAL_ORIGIN", "http://127.0.0.1:4010");
});

describe("活動日曆", () => {
  it("用登入者的 id 加帳號 id 讀（別人的帳號 id 讀到的是找不到）", async () => {
    requireSession.mockResolvedValue(OTHER_SESSION);

    await html();

    expect(cached.cachedActCalendar).toHaveBeenCalledWith(OTHER_SESSION.id, 3);
  });

  it("只列正在進行的，快結束的排前面：終局挑戰虛構敘事（剩 3 天）在混沌回憶（剩 20 天）前面，還沒開放的不列", async () => {
    const markup = await html();

    expect(markup.indexOf("虛構敘事")).toBeLessThan(markup.indexOf("混沌回憶"));
    expect(markup).not.toContain("下一期");
    expect(markup.indexOf("花藏繁生")).toBeLessThan(markup.indexOf("以太戰線"));
    expect(markup).not.toContain("常駐活動");
  });

  it("寫出還剩多久（虛構敘事 3.5 天後結束是剩 3 天）、進度與目前的版本", async () => {
    const markup = await html();

    expect(markup).toContain("剩 3 天");
    expect(markup).toContain("8/12");
    expect(markup).toContain("3.7");
  });

  it("躍遷：五星的名字當標題、四星寫在說明；圖片經 externalAssetUrl（開發時改寫到假伺服器）", async () => {
    const markup = await html();

    expect(markup.indexOf("黃泉")).toBeLessThan(markup.indexOf("三月七"));
    expect(markup).toContain('src="http://127.0.0.1:4010/a/1308.png"');
  });

  it("讀不到_只在這一塊顯示原因", async () => {
    cached.cachedActCalendar.mockResolvedValue({ ok: false, message: "資料沒有公開：到 HoYoLAB → 戰績 → 設定，打開對應的公開設定（10102）" });

    expect(await html()).toContain("資料沒有公開");
  });
});
