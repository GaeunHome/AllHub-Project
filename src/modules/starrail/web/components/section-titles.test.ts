import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { mocksOf } from "@/dev/test-helpers";
import type { Endgame } from "../../lib/endgame";
import type { Ledger } from "../../lib/ledger";

vi.mock("@/core/auth", () => import("@/dev/session-stub"));
vi.mock("../../service/cached", { spy: true });

const cached = mocksOf(await import("../../service/cached"), "cachedLedger");
const { LedgerPanel, LedgerSkeleton } = await import("./ledger-panel");
const { EndgameSkeleton } = await import("./endgame-panel");
const { LedgerView } = await import("./ledger-view");
const { EndgameView } = await import("./endgame-view");

const ledger = (month: string): Ledger => ({
  month,
  months: ["202609", "202610"],
  current: { jade: 7150, passes: 8 },
  last: { jade: 8050, passes: 10 },
  jadeRate: -11,
  passRate: -20,
  today: { jade: 120, passes: 0 },
  sources: [],
});
const empty: Endgame = { mode: "chaos", hasData: false, name: null, begin: null, end: null, stars: null, maxFloor: null, battles: null, floors: [] };
const account = { id: 1, uid: "900000001", nickname: "開拓者", region: "prod_official_cht", level: 70, staminaAlertThreshold: null, cookieInvalid: false };

/** 標題列的最小高度：標題旁有切換鈕時看外面那一列，只有標題時看 h3 本身 */
function titleMinHeight(markup: string, title: string): string[] {
  const row = new RegExp(`<div class="([^"]*)"><h3[^>]*>${title}<`).exec(markup)?.[1] ?? "";
  const heading = new RegExp(`<h3[^>]*class="([^"]*)"[^>]*>${title}<`).exec(markup)?.[1] ?? "";
  return `${row} ${heading}`.split(/\s+/).filter((c) => c.startsWith("min-h-"));
}

describe("超寬螢幕並排的開拓月曆與終局戰績：兩邊的標題在同一條線上", () => {
  it("標題列一樣高，至少跟終局戰績的「本期／上期」分段選擇一樣高（44px）", () => {
    const ledgerMarkup = renderToStaticMarkup(createElement(LedgerView, { ledgers: [ledger("202609"), ledger("202610")], current: "202610", fetchedLabel: "今天 20:49" }));
    const endgameMarkup = renderToStaticMarkup(createElement(EndgameView, { records: [{ mode: "chaos", schedule: "current", ok: true, endgame: empty }], names: {} }));

    expect(titleMinHeight(ledgerMarkup, "開拓月曆")).toEqual(["min-h-11"]);
    expect(titleMinHeight(endgameMarkup, "終局戰績")).toEqual(["min-h-11"]);
  });

  it("載入中的骨架、開拓月曆讀不到時，標題列也一樣高：一邊先出來，另一邊的標題不會對不齊", async () => {
    cached.cachedLedger.mockResolvedValue({ ok: false, message: "HoYoLAB cookie 已失效", fetchedAt: new Date(), cookieInvalid: true });

    expect(titleMinHeight(renderToStaticMarkup(createElement(LedgerSkeleton)), "開拓月曆")).toEqual(["min-h-11"]);
    expect(titleMinHeight(renderToStaticMarkup(createElement(EndgameSkeleton)), "終局戰績")).toEqual(["min-h-11"]);
    expect(titleMinHeight(renderToStaticMarkup(await LedgerPanel({ account })), "開拓月曆")).toEqual(["min-h-11"]);
  });
});
