import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ModuleInfo } from "@/core/module";
import { OTHER_SESSION, requireSession } from "@/dev/session-stub";
import { mocksOf } from "@/dev/test-helpers";

vi.mock("@/core/auth", () => import("@/dev/session-stub"));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }), usePathname: () => "/savings/recurring" }));
vi.mock("../../service/cached", { spy: true });
// 三區換成只記下收到什麼的替身 這裡只看頁面讀了誰的資料與網址參數
vi.mock("../components/recurring/salary-section", () => ({ SalarySection: vi.fn(() => null) }));
vi.mock("../components/recurring/regular-buy-list", () => ({ RegularBuyList: vi.fn(() => null) }));
vi.mock("../components/recurring/other-recurring-list", () => ({ OtherRecurringList: vi.fn(() => null) }));

// 固定在台北時間 2026-10-16 中午
vi.useFakeTimers({ now: new Date("2026-10-16T04:00:00Z"), toFake: ["Date"] });

const cached = mocksOf(await import("../../service/cached"), "cachedAccounts", "cachedAccountFlows", "cachedRecurring", "cachedCategories", "cachedHoldings", "cachedQuotes");
const { SalarySection } = await import("../components/recurring/salary-section");
const { RegularBuyList } = await import("../components/recurring/regular-buy-list");
const { OtherRecurringList } = await import("../components/recurring/other-recurring-list");
const { RecurringPage, RecurringSection } = await import("./recurring-page");

const INFO: ModuleInfo = { id: "savings", name: "理財", href: "/savings", description: "", icon: "/icons/ui/wallet.svg", accent: "green", notifies: true };
const CREATED = new Date("2026-08-01T02:00:00Z");
const account = (id: number, name: string, kind: "deposit" | "investment" | "credit") => ({
  id,
  userId: "u",
  name,
  kind,
  label: null,
  cardStyle: null,
  purposeId: null,
  openingBalance: 0,
  openingCost: null,
  monthlyPlan: null,
  targetAmount: null,
  dueDay: null,
  statementDay: null,
  payFromAccountId: null,
  autopay: false,
  cardNotifiedOn: null,
  active: true,
  sortOrder: id,
  createdAt: CREATED,
});
const ACCOUNTS = [account(1, "生活費帳戶", "deposit"), account(2, "台銀", "deposit"), account(6, "臺銀證券", "investment")];
const rule = (id: number, fields: Record<string, unknown> = {}) => ({
  id,
  userId: "u",
  kind: "expense",
  name: "房租",
  accountId: 1,
  counterAccountId: null,
  categoryId: null,
  amount: 15000,
  dayOfMonth: 20,
  intervalMonths: 1,
  startMonth: null,
  holidayRule: "none",
  mode: "confirm",
  holdingId: null,
  allocate: false,
  note: null,
  active: true,
  lastPostedMonth: "2026-09-01",
  lastNotifiedOn: null,
  createdAt: CREATED,
  ...fields,
});
const RULES = [rule(30, { kind: "income", name: "薪水", allocate: true, dayOfMonth: 10 }), rule(32)];
const HOLDINGS = [{ id: 50, userId: "u", accountId: 6, symbol: "006208", name: "富邦台灣50", shares: 238, cost: 24000, sortOrder: 0, createdAt: CREATED }];

const visit = async (search: Record<string, string | string[] | undefined> = {}) => renderToStaticMarkup((await RecurringSection({ searchParams: Promise.resolve(search) })) as ReactElement);
const propsOf = (component: unknown) => vi.mocked(component as (props: Record<string, unknown>) => null).mock.calls[0][0];

beforeEach(() => {
  requireSession.mockReset();
  cached.cachedAccounts.mockReset().mockResolvedValue(ACCOUNTS);
  cached.cachedAccountFlows.mockReset().mockResolvedValue([]);
  cached.cachedRecurring.mockReset().mockResolvedValue(RULES);
  cached.cachedCategories.mockReset().mockResolvedValue([]);
  cached.cachedHoldings.mockReset().mockResolvedValue(HOLDINGS);
  cached.cachedQuotes.mockReset().mockResolvedValue([]);
  for (const component of [SalarySection, RegularBuyList, OtherRecurringList]) vi.mocked(component).mockClear();
});

describe("每月固定頁", () => {
  it("頁首與分頁列（每月固定是目前這一頁）", () => {
    const markup = renderToStaticMarkup(createElement(RecurringPage, { info: INFO, searchParams: Promise.resolve({}) }));

    expect(markup).toMatch(/<a [^>]*aria-current="page"[^>]*href="\/savings\/recurring"|<a [^>]*href="\/savings\/recurring"[^>]*aria-current="page"/);
  });

  it("用登入者（bob）的 id 讀資料", async () => {
    requireSession.mockResolvedValue(OTHER_SESSION);

    await visit();

    for (const read of ["cachedAccounts", "cachedAccountFlows", "cachedRecurring", "cachedCategories", "cachedHoldings"] as const) expect(cached[read]).toHaveBeenCalledWith(OTHER_SESSION.id);
  });

  it("薪水、定期定額、其他固定收支各一區", async () => {
    await visit();

    expect((propsOf(SalarySection).items as { id: number }[]).map((item) => item.id)).toEqual([30]);
    expect(propsOf(RegularBuyList).items).toEqual([]);
    expect((propsOf(OtherRecurringList).items as { id: number }[]).map((item) => item.id)).toEqual([32]);
  });

  it("沒有定期定額_不查股價", async () => {
    await visit();

    expect(cached.cachedQuotes).not.toHaveBeenCalled();
  });

  it("有定期定額_只查那幾檔的股價（確認時估股數）", async () => {
    cached.cachedRecurring.mockResolvedValue([...RULES, rule(31, { kind: "transfer", accountId: 2, counterAccountId: 6, holdingId: 50, dayOfMonth: 5 })]);

    await visit();

    expect(cached.cachedQuotes).toHaveBeenCalledWith(["006208"]);
  });

  it.each([
    [{ add: "salary" }, [true, false, false]],
    [{ add: "regular-buy" }, [false, true, false]],
    [{ add: "other" }, [false, false, true]],
    [{ add: "account" }, [false, false, false]],
    [{ add: ["salary", "other"] }, [false, false, false]],
  ])("網址 %j（總覽的開始設定連過來）_打開哪一區的新增：%j", async (search, opens) => {
    await visit(search);

    expect([propsOf(SalarySection).openAdd, propsOf(RegularBuyList).openAdd, propsOf(OtherRecurringList).openAdd]).toEqual(opens);
  });

  it.each([
    [{ edit: "32" }, 32],
    [{ edit: "999" }, null],
    [{ edit: "abc" }, null],
    [{}, null],
  ])("網址 %j（這個月要做的事的修改連過來）_只打開自己的那一條：%s", async (search, openEditId) => {
    await visit(search);

    expect(propsOf(OtherRecurringList).openEditId).toBe(openEditId);
    expect(propsOf(SalarySection).openEditId).toBe(openEditId);
  });

  it("別人的固定收支 id_讀的是登入者自己的清單，不在裡面就不打開", async () => {
    requireSession.mockResolvedValue(OTHER_SESSION);
    cached.cachedRecurring.mockResolvedValue([]);

    await visit({ edit: "32" });

    expect(propsOf(OtherRecurringList).openEditId).toBeNull();
  });

  it("還沒有帳戶_說明並連到新增銀行帳戶", async () => {
    cached.cachedAccounts.mockResolvedValue([]);

    const markup = await visit();

    expect(markup).toContain('href="/savings/accounts?add=deposit"');
    expect(SalarySection).not.toHaveBeenCalled();
  });
});
