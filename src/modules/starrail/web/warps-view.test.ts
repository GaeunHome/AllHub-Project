import { describe, expect, it } from "vitest";
import { WARP_BANNERS, summarizeBanner, type FiveStar } from "../lib/warps";
import { lastPage, pageFrom, pickBanner, pityText, pullsText, shownBanners } from "./warps-view";

const empty = WARP_BANNERS.map((banner) => summarizeBanner(banner, []));
const withPulls = (id: number) =>
  WARP_BANNERS.map((banner) => summarizeBanner(banner, banner.id === id ? [{ id: "1", bannerType: id, gachaId: 1, itemId: 1, name: "x", itemType: null, rarity: 3, time: new Date(0) }] : []));

describe("pickBanner：打開時看哪個卡池", () => {
  it("網址指定的卡池", () => {
    expect(pickBanner(empty, "12").banner.id).toBe(12);
  });

  it("沒指定或認不得_第一個有紀錄的卡池", () => {
    expect(pickBanner(withPulls(1), undefined).banner.id).toBe(1);
    expect(pickBanner(withPulls(12), "99").banner.id).toBe(12);
  });

  it("都沒有紀錄_角色活動", () => {
    expect(pickBanner(empty, undefined).banner.id).toBe(11);
  });

  it("網址帶好幾個值或亂寫_不出錯", () => {
    expect(pickBanner(empty, ["11", "12"]).banner.id).toBe(11);
    expect(pickBanner(empty, "abc").banner.id).toBe(11);
  });
});

describe("shownBanners：分頁列", () => {
  it("角色、光錐、常駐一直都在；新手與聯動有紀錄才出現", () => {
    expect(shownBanners(empty).map((row) => row.banner.id)).toEqual([11, 12, 1]);
    expect(shownBanners(withPulls(2)).map((row) => row.banner.id)).toEqual([11, 12, 1, 2]);
    expect(shownBanners(withPulls(21)).map((row) => row.banner.id)).toEqual([11, 12, 1, 21]);
  });
});

describe("頁數（一頁 20 筆）", () => {
  it("45 筆是 3 頁，40 筆是 2 頁，0 筆也算 1 頁", () => {
    expect(lastPage(45)).toBe(3);
    expect(lastPage(40)).toBe(2);
    expect(lastPage(0)).toBe(1);
  });

  it.each([
    ["2", 45, 2],
    ["99", 45, 3],
    ["0", 45, 1],
    ["-3", 45, 1],
    ["abc", 45, 1],
    ["1.5", 45, 1],
    [undefined, 45, 1],
    [["2", "3"], 45, 1],
  ] as const)("網址的 page %j 共 %d 筆 → 第 %d 頁", (raw, total, expected) => {
    expect(pageFrom(raw as string | string[] | undefined, total)).toBe(expected);
  });
});

describe("文字", () => {
  const banner = WARP_BANNERS.find(({ id }) => id === 11)!;
  const star = (pulls: number, partial: boolean): FiveStar => ({ id: "1", name: "希兒", itemType: "角色", time: new Date(0), pulls, partial });

  it("紀錄裡有五星時寫已墊幾抽；沒有五星時只知道下限", () => {
    expect(pityText({ ...summarizeBanner(banner, []), total: 30, pity: 23, pityKnown: true })).toBe("已墊 23 抽");
    expect(pityText({ ...summarizeBanner(banner, []), total: 23, pity: 23, pityKnown: false })).toBe("至少已墊 23 抽");
  });

  it("還沒有紀錄_不寫數字", () => {
    expect(pityText(summarizeBanner(banner, []))).toBe("還沒有紀錄");
  });

  it("最舊的五星之前可能有更早的紀錄_寫至少", () => {
    expect(pullsText(star(74, false))).toBe("74 抽");
    expect(pullsText(star(3, true))).toBe("至少 3 抽");
  });
});
