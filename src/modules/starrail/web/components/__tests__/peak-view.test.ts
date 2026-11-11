import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { markup, textOf } from "@/dev/test-helpers";
import type { TeamMember } from "../../../lib/endgame";
import type { Peak, PeakSeason, PeakStage } from "../../../lib/peak";
import { PeakView, peakSeasonFor } from "../peak-view";

const member = (id: number, eidolon = 0): TeamMember => ({ id, level: 80, icon: `http://mock/avatar/${id}.png`, rarity: 5, element: "ice", elementIcon: "/icons/starrail/element/ice.png", eidolon });
const knight = (name: string, stars: number, rounds: number, quickClear = false): PeakStage => ({ name, icon: `http://mock/monster/${name}.png`, cleared: true, stars, rounds, quickClear, avatars: [member(1102), member(1005)] });
const season = (overrides: Partial<PeakSeason> = {}): PeakSeason => ({
  hasData: true,
  name: "王棋與騎士",
  version: "3.7",
  begin: "2026/10/27 04:00",
  end: "2026/12/8 03:59",
  theme: "http://mock/theme.png",
  battles: 5,
  bossStars: 3,
  knightStars: 8,
  boss: { name: "帕姆王", icon: "http://mock/boss.png", cleared: true, stars: 3, rounds: 12, quickClear: null, avatars: [member(1213, 1), member(1101, 6)], hardMode: true, hardModeName: "絕境", buff: { name: "王的敕令", description: "首領受到的傷害提高", icon: "http://mock/buff.png" }, medal: "http://mock/medal.png" },
  knights: [knight("銀鬃鐵衛", 3, 3), knight("虛卒", 2, 6), knight("裂界造物", 3, 4, true)],
  ...overrides,
});
const render = (value: PeakSeason | null) => markup(createElement(PeakView, { season: value, names: {} }));

describe("異相仲裁（使用者選的：王棋在上、騎士在下）", () => {
  it("王棋的卡片排在三個騎士前面", () => {
    const text = textOf(render(season()), { spaced: true });

    expect(text.indexOf("帕姆王")).toBeGreaterThan(-1);
    expect(text.indexOf("帕姆王")).toBeLessThan(text.indexOf("銀鬃鐵衛"));
  });

  it("王棋：高難度的名稱、星數、回合、增益與首領大圖", () => {
    const html = render(season());
    const text = textOf(html, { spaced: true });

    expect(text).toContain("絕境");
    expect(text).toContain("12 回合");
    expect(text).toContain("王的敕令");
    expect(html).toContain('aria-label="王棋 3 顆星"');
    expect(html).toContain("http://mock/boss.png");
  });

  it("三個騎士照順序（騎士一二三）：怪物名稱、星數、回合，快速通關的標出來", () => {
    const html = render(season());
    const text = textOf(html, { spaced: true });

    expect(["銀鬃鐵衛", "虛卒", "裂界造物"].map((name) => text.indexOf(name))).toEqual([...[text.indexOf("銀鬃鐵衛"), text.indexOf("虛卒"), text.indexOf("裂界造物")]].sort((a, b) => a - b));
    expect(html).toContain('aria-label="騎士 2 顆星"');
    expect(text).toContain("6 回合");
    expect(text.match(/快速通關/g)).toHaveLength(1);
  });

  it("最上面寫這一期的名稱、版本、期間、王棋與騎士的星數、挑戰次數，放主題圖與評級勳章", () => {
    const html = render(season());
    const text = textOf(html, { spaced: true });

    expect(text).toContain("王棋與騎士");
    expect(text).toContain("3.7");
    expect(text).toContain("2026/10/27 04:00");
    expect(text).toContain("5 次");
    expect(html).toContain("http://mock/theme.png");
    expect(html).toContain("http://mock/medal.png");
  });

  it("這一期還沒打_寫還沒有挑戰紀錄（跟另外三種一樣），不畫王棋與騎士", () => {
    const text = textOf(render(season({ hasData: false })));

    expect(text).toContain("這一期還沒有挑戰紀錄");
    expect(text).not.toContain("銀鬃鐵衛");
  });

  it("沒有這一期（從來沒打過或 HoYoLAB 沒給上期）_寫還沒有挑戰紀錄", () => {
    expect(textOf(render(null))).toContain("還沒有挑戰紀錄");
  });
});

describe("peakSeasonFor：本期與上期對到最近兩期（HoYoLAB 一次回最近三期，新的在前）", () => {
  const peak: Peak = { seasons: [season({ name: "本期" }), season({ name: "上期" }), season({ name: "上上期" })] };

  it("本期是第一個、上期是第二個", () => {
    expect(peakSeasonFor(peak, "current")?.name).toBe("本期");
    expect(peakSeasonFor(peak, "previous")?.name).toBe("上期");
  });

  it("只有一期時上期是 null", () => {
    expect(peakSeasonFor({ seasons: [season()] }, "previous")).toBeNull();
  });
});
