import { beforeEach, describe, expect, it, vi } from "vitest";
import { OTHER_SESSION, requireSession } from "@/dev/session-stub";
import { markup, mocksOf } from "@/dev/test-helpers";
import { accountRow } from "../../dev/fixtures";

vi.mock("@/core/auth", () => import("@/dev/session-stub"));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }), usePathname: () => "/savings/investments" }));
vi.mock("../../service/cached", { spy: true });
// 換成只記下收到什麼的替身 這裡只看頁面讀了誰的資料與網址參數
vi.mock("../components/investments/brokerage-list", () => ({ BrokerageList: vi.fn(() => null) }));
vi.mock("../components/recurring/regular-buy-list", () => ({ RegularBuyList: vi.fn(() => null) }));

vi.useFakeTimers({ now: new Date("2026-10-16T04:00:00Z"), toFake: ["Date"] });

const cached = mocksOf(await import("../../service/cached"), "cachedAccounts", "cachedAccountFlows", "cachedHoldings", "cachedRecurring", "cachedCategories", "cachedQuotes");
const { BrokerageList } = await import("../components/investments/brokerage-list");
const { RegularBuyList } = await import("../components/recurring/regular-buy-list");
const { InvestmentsSection } = await import("./investments-page");

const CREATED = new Date("2026-08-01T02:00:00Z");
const ACCOUNTS = [accountRow({ id: 1, name: "台銀", kind: "deposit" }), accountRow({ id: 9, name: "舊帳戶", kind: "deposit", active: false }), accountRow({ id: 6, name: "臺銀證券", kind: "investment" })];
const HOLDINGS = [
  { id: 50, userId: "u", accountId: 6, symbol: "006208", name: "富邦台灣50", shares: 238, cost: 24000, sortOrder: 0, createdAt: CREATED },
  { id: 51, userId: "u", accountId: 6, symbol: "0050", name: "元大台灣50", shares: 100, cost: 15000, sortOrder: 1, createdAt: CREATED },
];

const visit = async (search: Record<string, string | string[] | undefined> = {}) => markup(await InvestmentsSection({ searchParams: Promise.resolve(search) }));
const listProps = () => vi.mocked(BrokerageList).mock.calls[0][0];

beforeEach(() => {
  requireSession.mockReset();
  cached.cachedAccounts.mockReset().mockResolvedValue(ACCOUNTS);
  cached.cachedAccountFlows.mockReset().mockResolvedValue([]);
  cached.cachedHoldings.mockReset().mockResolvedValue(HOLDINGS);
  cached.cachedRecurring.mockReset().mockResolvedValue([]);
  cached.cachedCategories.mockReset().mockResolvedValue([]);
  cached.cachedQuotes.mockReset().mockResolvedValue([]);
  vi.mocked(BrokerageList).mockClear();
  vi.mocked(RegularBuyList).mockClear();
});

describe("投資頁", () => {
  it("用登入者（bob）的 id 讀資料", async () => {
    requireSession.mockResolvedValue(OTHER_SESSION);

    await visit();

    for (const read of ["cachedAccounts", "cachedAccountFlows", "cachedHoldings", "cachedRecurring", "cachedCategories"] as const) expect(cached[read]).toHaveBeenCalledWith(OTHER_SESSION.id);
  });

  it("股價只查持股的代號（排序去重）；沒有持股時不查", async () => {
    await visit();
    expect(cached.cachedQuotes).toHaveBeenCalledWith(["0050", "006208"]);

    cached.cachedQuotes.mockClear();
    cached.cachedHoldings.mockResolvedValue([]);
    await visit();
    expect(cached.cachedQuotes).not.toHaveBeenCalled();
  });

  it("買賣能選的帳戶：啟用中的存款帳戶", async () => {
    await visit();

    expect((listProps().depositAccounts as { id: number }[]).map((item) => item.id)).toEqual([1]);
  });

  it.each([
    [{ add: "investment" }, true],
    [{ add: "deposit" }, false],
    [{}, false],
  ])("網址 %j_新增證券帳戶的視窗要不要自己打開：%s", async (search, openAdd) => {
    await visit(search);

    expect(listProps().openAdd).toBe(openAdd);
  });

  it("定期定額一區跟每月固定頁是同一個元件，這裡不再連回投資頁", async () => {
    await visit();

    expect(vi.mocked(RegularBuyList).mock.calls[0][0]).toMatchObject({ items: [], linkToInvestments: false });
  });
});
