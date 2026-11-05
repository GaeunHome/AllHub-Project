import { describe, expect, it } from "vitest";
import { markup, textOf } from "@/dev/test-helpers";
import { WARP_BANNERS, summarizeBanner, type WarpRow } from "../../../lib/warps";
import { FiveStarList, PityPanel } from "../warp-history";

const bannerOf = (id: number) => WARP_BANNERS.find((banner) => banner.id === id)!;
const SAMPLE: WarpRow[] = [
  { pulls: 23, star: null },
  { pulls: 77, star: { name: "真珠", isUp: true } },
  { pulls: 76, star: { name: "瓦爾特", isUp: false } },
  { pulls: 78, star: { name: "知更鳥•晴歌", isUp: true } },
];
const listText = (id: number, rows = SAMPLE) => textOf(markup(FiveStarList({ summary: summarizeBanner(bannerOf(id), rows) })), { spaced: true });

describe("PityPanel：保底進度", () => {
  it("真實樣本：已墊 23 抽、距離保底 67 抽、平均 77 抽", () => {
    const text = textOf(markup(PityPanel({ summary: summarizeBanner(bannerOf(11), SAMPLE) })), { spaced: true });

    expect(text).toContain("已墊 23 抽");
    expect(text).toContain("距離保底 67 抽");
    expect(text).toContain("平均 77 抽");
  });

  it("還沒有五星_平均是一條線，不是 NaN", () => {
    const text = textOf(markup(PityPanel({ summary: summarizeBanner(bannerOf(11), [{ pulls: 5, star: null }]) })), { spaced: true });

    expect(text).toContain("平均 —");
    expect(text).not.toContain("NaN");
  });
});

describe("FiveStarList：五星歷史", () => {
  it("限定卡池：寫名稱與幾抽，只有歪的那一列標歪", () => {
    const text = listText(11);

    expect(text).toContain("真珠 77 抽");
    expect(text).toContain("瓦爾特 歪 76 抽");
    expect(text).toContain("知更鳥•晴歌 78 抽");
    expect(text.match(/歪/g)).toHaveLength(1);
  });

  it("常駐回的 is_up 全部是 false_不標歪", () => {
    expect(listText(1, [{ pulls: 76, star: { name: "瓦爾特", isUp: false } }])).not.toContain("歪");
  });

  it("沒有時間欄位_不寫日期", () => {
    expect(listText(11)).not.toMatch(/\d{1,4}[/-]\d{1,2}/);
  });

  it("沒有五星_說還沒有", () => {
    expect(listText(11, [{ pulls: 5, star: null }])).toContain("還沒有五星");
  });
});
