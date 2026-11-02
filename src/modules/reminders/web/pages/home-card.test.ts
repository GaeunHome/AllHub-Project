import type { ReactElement } from "react";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { OTHER_SESSION, TEST_SESSION, requireSession } from "@/dev/session-stub";
import { markup, mocksOf, textOf } from "@/dev/test-helpers";
import type { ReminderItem } from "../../service/items";

vi.mock("@/core/auth", () => import("@/dev/session-stub"));
vi.mock("../../service/cached", { spy: true });
// 真的選單關著時不算繪項目 換掉才看得到修改與刪除
vi.mock("@/core/ui/more-menu", () => import("@/dev/more-menu-stub"));
// 要看刪除鈕的確認訊息 那是點了才跳的 算繪不出來
vi.mock("@/core/ui/action-button", { spy: true });

const { menuOf, outsideMenus } = await import("@/dev/more-menu-stub");
const { ActionButton } = await import("@/core/ui/action-button");
const { cachedReminders } = mocksOf(await import("../../service/cached"), "cachedReminders");
const { RemindersSnapshot } = await import("./home-card");

const html = async () => markup((await RemindersSnapshot()) as ReactElement);

// 台北 11/2 中午
const NOON = new Date("2026-11-02T04:00:00Z");
// 過了台北的午夜 排程還沒跑
const AFTER_MIDNIGHT = new Date("2026-11-02T16:10:00Z");

let nextId = 1;
const item = (title: string, date: string): ReminderItem => ({ id: nextId++, title, date, notifyDaysBefore: 0 });

beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
});
afterAll(() => {
  vi.useRealTimers();
});

beforeEach(() => {
  vi.setSystemTime(NOON);
  requireSession.mockReset().mockResolvedValue(TEST_SESSION);
  cachedReminders.mockReset().mockResolvedValue([]);
  vi.mocked(ActionButton).mockClear();
});

describe("首頁的提醒與倒數卡片", () => {
  it("用登入者的 id 讀", async () => {
    requireSession.mockResolvedValue(OTHER_SESSION);

    await html();

    expect(cachedReminders.mock.calls[0][0]).toBe(OTHER_SESSION.id);
  });

  it("還沒有提醒時是空狀態，帶「新增提醒」按鈕", async () => {
    expect(await html()).toMatch(/<button[^>]*aria-haspopup="dialog"[^>]*>.*新增提醒.*<\/button>/);
  });

  it("標題、日期與倒數都看得到；今天、明天、還有 N 天", async () => {
    cachedReminders.mockResolvedValue([item("繳房屋稅", "2026-11-02"), item("媽媽生日", "2026-11-03"), item("考試", "2026-11-30"), item("換駕照", "2027-01-05")]);

    const text = textOf(outsideMenus(await html()), { spaced: true });

    expect(text).toContain("繳房屋稅 11/2 今天");
    expect(text).toContain("媽媽生日 11/3 明天");
    expect(text).toContain("考試 11/30 還有 28 天");
    expect(text).toContain("換駕照 2027/1/5 還有 64 天");
  });

  it("還有提醒時也能新增：按鈕打開視窗，不是只有空狀態才有", async () => {
    cachedReminders.mockResolvedValue([item("繳房屋稅", "2026-11-30")]);

    expect(outsideMenus(await html())).toMatch(/<button[^>]*aria-haspopup="dialog"[^>]*>.*新增.*<\/button>/);
  });

  it("過了午夜、排程還沒跑時，快取裡昨天的項目不顯示；只剩過期的就是空狀態", async () => {
    cachedReminders.mockResolvedValue([item("昨天到期", "2026-11-02"), item("今天到期", "2026-11-03")]);
    expect(textOf(await html())).toContain("昨天到期");

    vi.setSystemTime(AFTER_MIDNIGHT);
    const text = textOf(await html());
    expect(text).not.toContain("昨天到期");
    expect(text).toContain("今天到期");

    cachedReminders.mockResolvedValue([item("昨天到期", "2026-11-02")]);
    expect(textOf(await html())).toContain("新增提醒");
  });

  it("最近的 5 個直接顯示，其他的收在 details（還有 N 個）；剛好 5 個時沒有 details", async () => {
    const items = ["03", "04", "05", "06", "07", "08", "09"].map((day) => item(`11/${day} 的提醒`, `2026-11-${day}`));
    cachedReminders.mockResolvedValue(items);

    const [shown, more] = (await html()).split("<details");

    expect(textOf(shown)).toContain("11/07 的提醒");
    expect(textOf(shown)).not.toContain("11/08 的提醒");
    expect(textOf(more)).toContain("還有 2 個");
    expect(textOf(more)).toContain("11/08 的提醒");
    expect(textOf(more)).toContain("11/09 的提醒");
    expect(more).toContain('class="disclosure');

    cachedReminders.mockResolvedValue(items.slice(0, 5));
    expect(await html()).not.toContain("<details");
  });

  it("修改與刪除收在 ⋮：修改打開視窗（aria-haspopup），刪除帶著這一列的 id、先跳確認", async () => {
    const reminder = item("繳房屋稅", "2026-11-30");
    cachedReminders.mockResolvedValue([reminder]);

    const page = await html();

    const menu = menuOf(page, "「繳房屋稅」的選項");
    expect(menu).toMatch(/<button[^>]*aria-haspopup="dialog"[^>]*>.*修改.*<\/button>/);
    expect(textOf(menu)).toContain("刪除");
    expect(textOf(outsideMenus(page))).not.toContain("刪除");

    const [props] = vi.mocked(ActionButton).mock.calls[0];
    expect(props.fields).toEqual({ id: reminder.id });
    expect(props.confirmMessage).toContain("繳房屋稅");
  });
});
