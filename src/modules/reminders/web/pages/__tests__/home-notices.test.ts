import { beforeEach, describe, expect, it, vi } from "vitest";
import { OTHER_SESSION, TEST_SESSION, requireSession } from "@/dev/session-stub";
import { markup, mocksOf, textOf } from "@/dev/test-helpers";

vi.mock("@/core/auth", () => import("@/dev/session-stub"));
vi.mock("../../../service/cached", { spy: true });

const { cachedReminders } = mocksOf(await import("../../../service/cached"), "cachedReminders");
const { RemindersNotices } = await import("../home-notices");

const item = (id: number, title: string, date: string) => ({ id, title, date, notifyDays: null });
// 台北時間 2026/11/4 中午
const NOW = new Date("2026-11-04T04:00:00Z");

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  requireSession.mockReset().mockResolvedValue(TEST_SESSION);
  cachedReminders.mockReset().mockResolvedValue([item(1, "牙醫回診", "2026-11-04"), item(2, "繳學費", "2026-11-05"), item(3, "演唱會", "2026-11-06")]);
});

const text = async () => textOf(await Promise.all((await RemindersNotices()).map((node) => markup(node))).then((rows) => rows.join("")));

describe("今天要注意的提醒", () => {
  it("只列今天與明天的事，更遠的看卡片的倒數就好", async () => {
    const shown = await text();

    expect(shown).toContain("牙醫回診");
    expect(shown).toContain("繳學費");
    expect(shown).not.toContain("演唱會");
    vi.useRealTimers();
  });

  it("用登入者的 id 讀", async () => {
    requireSession.mockResolvedValue(OTHER_SESSION);

    await text();

    expect(cachedReminders).toHaveBeenCalledWith(OTHER_SESSION.id);
    vi.useRealTimers();
  });
});
