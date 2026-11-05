import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { OTHER_SESSION, TEST_SESSION, requireSession } from "@/dev/session-stub";
import { mocksOf, textOf } from "@/dev/test-helpers";
import { WARP_BANNERS, summarizeBanner, type BannerSummary, type WarpRow } from "../../../lib/warps";
import { accountView } from "../../../dev/fixtures";

vi.mock("@/core/auth", () => import("@/dev/session-stub"));
vi.mock("next/navigation", () => import("@/dev/navigation-stub"));
vi.mock("next/server", () => ({ after: (work: () => void) => work() }));
// next/font 只能在 Next 的建置裡執行
vi.mock("../../game-font", () => ({ gameFont: { variable: "" } }));
vi.mock("../../../service/cached", () => ({ cachedAccounts: vi.fn(), cachedWarps: vi.fn(), cachedProfile: vi.fn() }));
vi.mock("../../../service/warps", () => ({ reportWarps: vi.fn() }));

const cached = mocksOf(await import("../../../service/cached"), "cachedAccounts", "cachedWarps", "cachedProfile");
const { reportWarps } = await import("../../../service/warps");
const { WarpsArea } = await import("../warps-page");
const { WarpCard } = await import("../../components/warp-card");

const MINE = [accountView({ id: 1, uid: "800000001", nickname: "角色 1" }), accountView({ id: 2, uid: "800000002", nickname: "角色 2" })];
const summaries = (rows: Partial<Record<number, WarpRow[]>>): BannerSummary[] => WARP_BANNERS.map((banner) => summarizeBanner(banner, rows[banner.id] ?? []));
const READ = {
  ok: true as const,
  summaries: summaries({
    11: [{ pulls: 23, star: null }, { pulls: 77, star: { name: "真珠", isUp: true } }, { pulls: 76, star: { name: "瓦爾特", isUp: false } }],
    12: [{ pulls: 10, star: null }],
  }),
};
const page = async (params: Record<string, string> = {}) => {
  const html = renderToStaticMarkup((await WarpsArea({ searchParams: Promise.resolve(params) })) as ReactElement);
  return { html, text: textOf(html, { spaced: true }) };
};

beforeEach(() => {
  requireSession.mockReset();
  vi.mocked(reportWarps).mockReset();
  cached.cachedAccounts.mockReset().mockResolvedValue(MINE);
  cached.cachedWarps.mockReset().mockResolvedValue(READ);
  cached.cachedProfile.mockReset().mockResolvedValue(null);
});

describe("躍遷紀錄頁", () => {
  it("用登入者的 id 讀；?account= 是別人的帳號時改看自己的第一個帳號", async () => {
    requireSession.mockResolvedValue(OTHER_SESSION);

    await page({ account: "99" });

    expect(cached.cachedAccounts).toHaveBeenCalledWith(OTHER_SESSION.id);
    expect(cached.cachedWarps).toHaveBeenCalledExactlyOnceWith(OTHER_SESSION.id, 1);
  });

  it("?account= 是自己的第二個帳號_讀那個帳號", async () => {
    await page({ account: "2" });

    expect(cached.cachedWarps).toHaveBeenCalledExactlyOnceWith(TEST_SESSION.id, 2);
  });

  it("預設看第一個有紀錄的卡池：已墊、距離保底、五星與歪都在", async () => {
    const { text } = await page();

    expect(text).toContain("已墊 23 抽");
    expect(text).toContain("距離保底 67 抽");
    expect(text).toContain("瓦爾特 歪 76 抽");
  });

  it("?banner= 換卡池", async () => {
    const { text } = await page({ banner: "12" });

    expect(text).toContain("已墊 10 抽");
    expect(text).toContain("距離保底 70 抽");
  });

  it("使用者不用按任何按鈕：沒有立即更新、全部抽卡與最新一抽", async () => {
    const { text } = await page();

    for (const removed of ["立即更新", "全部抽卡", "最新一抽", "總抽數"]) expect(text).not.toContain(removed);
  });

  it("讀不到_帳號切換還在，寫出原因，保底與五星不出現", async () => {
    cached.cachedWarps.mockResolvedValue({ ok: false, message: "cookie_token_v2 已過期，請重新貼上", serviceDown: false });

    const { text } = await page();

    expect(text).toContain("cookie_token_v2 已過期，請重新貼上");
    expect(text).toContain("角色 2");
    expect(text).not.toContain("距離保底");
  });

  it("這個卡池沒抽過_說還沒有紀錄", async () => {
    expect((await page({ banner: "1" })).text).toContain("這個卡池還沒有紀錄");
  });

  it("還沒連結帳號_不讀 HoYoLAB，連到星穹鐵道頁", async () => {
    cached.cachedAccounts.mockResolvedValue([]);

    const { html } = await page();

    expect(cached.cachedWarps).not.toHaveBeenCalled();
    expect(html).toContain('href="/starrail"');
  });

  it("快取函式裡不能寫資料庫：讀完由頁面把結果交給系統狀態（不管成功或失敗）", async () => {
    await page();
    expect(reportWarps).toHaveBeenCalledExactlyOnceWith(READ);

    const failed = { ok: false, message: "太頻繁", serviceDown: true };
    cached.cachedWarps.mockResolvedValue(failed);
    await page();
    expect(reportWarps).toHaveBeenLastCalledWith(failed);
  });
});

describe("星穹鐵道頁的摘要卡", () => {
  const card = async () => {
    const html = renderToStaticMarkup((await WarpCard({ account: MINE[0] })) as ReactElement);
    return { html, text: textOf(html, { spaced: true }) };
  };

  it("只放角色與光錐活動的已墊，點了到躍遷紀錄頁", async () => {
    const { html, text } = await card();

    expect(text).toContain("角色活動 已墊 23 抽");
    expect(text).toContain("光錐活動 已墊 10 抽");
    expect(text).not.toContain("常駐");
    expect(html).toContain("/starrail/warps?account=1");
  });

  it("都沒有紀錄_不再叫人按已經不存在的立即更新", async () => {
    cached.cachedWarps.mockResolvedValue({ ok: true, summaries: summaries({}) });

    const { text } = await card();

    expect(text).toContain("還沒有");
    expect(text).not.toContain("立即更新");
    expect(text).not.toContain("每天會自動更新");
  });

  it("讀不到_只在這一塊寫原因", async () => {
    cached.cachedWarps.mockResolvedValue({ ok: false, message: "cookie_token_v2 已過期，請重新貼上", serviceDown: false });

    expect((await card()).text).toContain("cookie_token_v2 已過期，請重新貼上");
  });

  it("結果一樣交給系統狀態", async () => {
    await card();

    expect(reportWarps).toHaveBeenCalledExactlyOnceWith(READ);
  });
});
