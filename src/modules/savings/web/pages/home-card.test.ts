import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { OTHER_SESSION, requireSession } from "@/dev/session-stub";
import { mocksOf } from "@/dev/test-helpers";
import { addMonths, taipeiMonth } from "../../lib/month";

vi.mock("@/core/auth", () => import("@/dev/session-stub"));
vi.mock("../../service/cached", { spy: true });

const cached = mocksOf(await import("../../service/cached"), "cachedGoals", "cachedEntryTotals");
const { SavingsSnapshot } = await import("./home-card");

const textOf = (markup: string) => markup.replace(/<[^>]+>/g, "");
const html = async () => renderToStaticMarkup((await SavingsSnapshot()) as ReactElement);
const MONTH = taipeiMonth(new Date());

const goal = (id: number, name: string, monthlyAmount: number, active = true) => ({ id, userId: null, name, monthlyAmount, note: null, active, sortOrder: id, createdAt: new Date() });
const GOALS = [goal(1, "緊急預備金", 10000), goal(2, "旅遊基金", 3000), goal(3, "換手機", 2000), goal(4, "換車", 5000, false)];
const total = (goalId: number | null, goalName: string | null, amount: number, month = MONTH) => ({ month, goalId, goalName, amount });

beforeEach(() => {
  requireSession.mockReset();
  cached.cachedGoals.mockReset().mockResolvedValue(GOALS);
  cached.cachedEntryTotals.mockReset().mockResolvedValue([total(1, "緊急預備金", 10000), total(2, "旅遊基金", 1500), total(null, null, 800)]);
});

describe("首頁「本月存款」（存錢記帳）", () => {
  it("用登入者的 id 讀項目與紀錄", async () => {
    requireSession.mockResolvedValue(OTHER_SESSION);

    await html();

    expect(cached.cachedGoals).toHaveBeenCalledWith(OTHER_SESSION.id);
    expect(cached.cachedEntryTotals).toHaveBeenCalledWith(OTHER_SESSION.id);
  });

  it("這個月的進度：已存（含臨時存款）、應存、還差多少、達成百分比與存滿的項目數", async () => {
    const text = textOf(await html());

    expect(text).toContain("已存");
    expect(text).toContain("$12,300");
    expect(text).toContain("應存");
    expect(text).toContain("$15,000");
    expect(text).toContain("還差");
    expect(text).toContain("$3,500");
    expect(text).toContain("82%");
    expect(text).toContain("1／3 個項目已存滿");
  });

  it("別的月份的紀錄不算進這個月", async () => {
    cached.cachedEntryTotals.mockResolvedValue([total(1, "緊急預備金", 10000, addMonths(MONTH, -1))]);

    const text = textOf(await html());

    expect(text).toContain("$0");
    expect(text).toContain("0%");
    expect(text).toContain("0／3 個項目已存滿");
  });

  it("項目都存滿_說明都存滿了", async () => {
    cached.cachedEntryTotals.mockResolvedValue([total(1, "緊急預備金", 10000), total(2, "旅遊基金", 3000), total(3, "換手機", 2000)]);

    expect(textOf(await html())).toContain("所有項目都存滿了");
  });

  it("還沒有任何項目_顯示建立的入口（到存錢記帳頁）", async () => {
    cached.cachedGoals.mockResolvedValue([]);
    cached.cachedEntryTotals.mockResolvedValue([]);

    const markup = await html();

    expect(textOf(markup)).toContain("還沒有每月固定項目");
    expect(markup).toMatch(/<a[^>]*href="\/savings"[^>]*>.*建立項目/);
  });

  it("項目都停用了_說明沒有啟用中的項目，連到存錢記帳頁", async () => {
    cached.cachedGoals.mockResolvedValue([goal(4, "換車", 5000, false)]);

    const markup = await html();

    expect(textOf(markup)).toContain("沒有啟用中的項目");
    expect(markup).toContain('href="/savings"');
  });
});
