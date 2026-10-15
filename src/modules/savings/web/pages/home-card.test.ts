import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { OTHER_SESSION, requireSession } from "@/dev/session-stub";
import { mocksOf } from "@/dev/test-helpers";
import { addMonths, taipeiMonth } from "../../lib/month";

vi.mock("@/core/auth", () => import("@/dev/session-stub"));
vi.mock("../../service/cached", { spy: true });

const cached = mocksOf(await import("../../service/cached"), "cachedAccounts", "cachedAccountFlows", "cachedCategoryTotals");
const { FinanceSnapshot, FinanceSnapshotSkeleton } = await import("./home-card");

const textOf = (markup: string) => markup.replace(/<[^>]+>/g, "");
const html = async () => renderToStaticMarkup((await FinanceSnapshot()) as ReactElement);
const MONTH = taipeiMonth(new Date());
const CREATED = new Date("2025-01-05T02:00:00Z");

const account = (id: number, name: string, kind: "deposit" | "investment" | "credit", openingBalance: number, active = true) => ({
  id,
  userId: "u",
  name,
  kind,
  purposeId: null,
  openingBalance,
  openingCost: null,
  monthlyPlan: null,
  targetAmount: null,
  dueDay: null,
  payFromAccountId: null,
  active,
  sortOrder: id,
  createdAt: CREATED,
});
const flow = (accountId: number, month: string, income: number, expense: number) => ({ accountId, month, income, expense, transferIn: 0, transferOut: 0, adjust: 0 });
const total = (kind: "income" | "expense", month: string, amount: number) => ({ categoryId: null, kind, month, amount });
/** 最後的數字 就是報讀器讀的那一份 */
const finals = (markup: string) => [...markup.matchAll(/<dt[^>]*>(.*?)<\/dt><dd[^>]*>.*?<span class="fin-count-final">(.*?)<\/span>/g)].map((m) => [textOf(m[1]), m[2]]);

beforeEach(() => {
  requireSession.mockReset();
  cached.cachedAccounts.mockReset().mockResolvedValue([account(1, "國泰", "deposit", 50000), account(2, "國泰信用卡", "credit", -3000), account(3, "舊帳戶", "deposit", 9000, false)]);
  cached.cachedAccountFlows.mockReset().mockResolvedValue([flow(1, MONTH, 43000, 12000), flow(1, addMonths(MONTH, -1), 0, 5000)]);
  cached.cachedCategoryTotals.mockReset().mockResolvedValue([total("income", MONTH, 43000), total("expense", MONTH, 12000), total("expense", addMonths(MONTH, -1), 5000)]);
});

describe("首頁的理財卡片", () => {
  it("用登入者的 id 讀帳戶與紀錄", async () => {
    requireSession.mockResolvedValue(OTHER_SESSION);

    await html();

    expect(cached.cachedAccounts).toHaveBeenCalledWith(OTHER_SESSION.id);
    expect(cached.cachedAccountFlows).toHaveBeenCalledWith(OTHER_SESSION.id);
    expect(cached.cachedCategoryTotals).toHaveBeenCalledWith(OTHER_SESSION.id);
  });

  it("本月支出與總資產（停用的帳戶與信用卡不算進總資產），數字從 0 往上數", async () => {
    expect(finals(await html())).toEqual([
      ["本月支出", "$12,000"],
      ["總資產", "$76,000"],
    ]);
  });

  it("上個月的支出不算進本月", async () => {
    cached.cachedCategoryTotals.mockResolvedValue([total("expense", addMonths(MONTH, -1), 5000)]);

    expect(finals(await html())[0]).toEqual(["本月支出", "$0"]);
  });

  it("還沒有帳戶_顯示開始使用的入口（到理財頁）", async () => {
    cached.cachedAccounts.mockResolvedValue([]);
    cached.cachedAccountFlows.mockResolvedValue([]);
    cached.cachedCategoryTotals.mockResolvedValue([]);

    const markup = await html();

    expect(textOf(markup)).toContain("還沒有帳戶");
    expect(markup).toMatch(/<a[^>]*href="\/savings"[^>]*>(?:(?!<\/a>).)*開始使用/);
  });

  it("骨架跟內容一樣依卡片的寬度排成一欄或兩欄，載入完不會跳", async () => {
    const grid = (markup: string) => markup.match(/class="(grid [^"]*@md:grid-cols-2[^"]*)"/)![1];

    expect(grid(renderToStaticMarkup(createElement(FinanceSnapshotSkeleton)))).toBe(grid(await html()));
  });
});
