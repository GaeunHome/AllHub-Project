import { describe, expect, it } from "vitest";
import { WARP_BANNERS, summarizeBanner } from "../../lib/warps";
import { hasRecords, pickBanner, pityText, shownBanners } from "../warps-view";

const empty = WARP_BANNERS.map((banner) => summarizeBanner(banner, []));
const withPulls = (id: number) => WARP_BANNERS.map((banner) => summarizeBanner(banner, banner.id === id ? [{ pulls: 3, star: null }] : []));

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

describe("hasRecords", () => {
  const banner = WARP_BANNERS[0];

  it("有已墊或有五星都算有紀錄；已墊 0 又沒有五星才算沒抽過", () => {
    expect(hasRecords(summarizeBanner(banner, [{ pulls: 3, star: null }]))).toBe(true);
    expect(hasRecords(summarizeBanner(banner, [{ pulls: 77, star: { name: "真珠", isUp: true, icon: null } }]))).toBe(true);
    expect(hasRecords(summarizeBanner(banner, [{ pulls: 0, star: null }]))).toBe(false);
    expect(hasRecords(summarizeBanner(banner, []))).toBe(false);
  });
});

describe("文字", () => {
  const banner = WARP_BANNERS[0];

  it("官方給的已墊是準確的數字，不寫至少", () => {
    expect(pityText(summarizeBanner(banner, [{ pulls: 23, star: null }]))).toBe("已墊 23 抽");
  });

  it("剛出五星_寫已墊 0 抽", () => {
    expect(pityText(summarizeBanner(banner, [{ pulls: 77, star: { name: "真珠", isUp: true, icon: null } }]))).toBe("已墊 0 抽");
  });

  it("還沒有紀錄_不寫數字", () => {
    expect(pityText(summarizeBanner(banner, []))).toBe("還沒有紀錄");
  });
});
