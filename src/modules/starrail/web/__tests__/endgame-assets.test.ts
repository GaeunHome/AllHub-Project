import { describe, expect, it } from "vitest";
import type { Endgame } from "../../lib/endgame";
import type { PeakSeason, PeakStage } from "../../lib/peak";
import { endgameAssetUrls, peakAssetUrls } from "../endgame-assets";
import { fakeAsset } from "../../dev/fixtures";

const member = (id: number) => ({ id, level: 80, icon: `https://cdn/${id}.png`, rarity: 5, element: "ice", elementIcon: "/icons/starrail/element/ice.png", eidolon: 0 });
const endgame: Endgame = {
  mode: "chaos",
  hasData: true,
  name: "期數",
  begin: "2026/10/6 04:00",
  end: "2026/10/20 03:00",
  stars: 36,
  maxFloor: "混沌回憶 12",
  maxFloorId: 1012,
  battles: 14,
  floors: [
    {
      id: 1012,
      name: "混沌回憶 12",
      stars: 3,
      rounds: 7,
      score: null,
      quickClear: false,
      nodes: [
        {
          slot: 1,
          avatars: [member(1), member(2)],
          score: null,
          bossDefeated: null,
          buff: { name: "增益", description: "說明", icon: "https://cdn/buff.png" },
          boss: { name: "首領", icon: "https://cdn/boss.png" },
        },
      ],
    },
  ],
};

describe("endgameAssetUrls：上場隊伍的頭像、首領與增益的圖都經過 externalAssetUrl", () => {
  it("每個頭像都換掉；屬性圖示是內建的靜態檔，原樣保留（不經 externalAssetUrl）；其他欄位不變", () => {
    const mapped = endgameAssetUrls(endgame, fakeAsset);

    expect(JSON.stringify(mapped)).not.toContain("https://");
    expect(mapped.floors[0].nodes[0].avatars.map((a) => a.icon)).toEqual(["http://mock/1.png", "http://mock/2.png"]);
    expect(mapped.floors[0].nodes[0].avatars.map((a) => a.elementIcon)).toEqual(["/icons/starrail/element/ice.png", "/icons/starrail/element/ice.png"]);
    expect(mapped.floors[0].nodes[0].boss?.icon).toBe("http://mock/boss.png");
    expect(mapped.floors[0].nodes[0].buff?.icon).toBe("http://mock/buff.png");
    expect(endgameAssetUrls(endgame, (url) => url)).toEqual(endgame);
  });
});

describe("peakAssetUrls：異相仲裁的圖都經過 externalAssetUrl", () => {
  const stage = (n: number): PeakStage => ({ name: `騎士${n}`, icon: `https://cdn/monster/${n}.png`, cleared: true, stars: 3, rounds: 4, quickClear: false, avatars: [member(n)] });
  const season: PeakSeason = {
    hasData: true,
    name: "王棋與騎士",
    version: "3.7",
    begin: "2026/10/27 04:00",
    end: "2026/12/8 03:59",
    theme: "https://cdn/theme.png",
    battles: 5,
    bossStars: 3,
    knightStars: 9,
    boss: { ...stage(9), name: "帕姆王", icon: "https://cdn/boss.png", hardMode: true, hardModeName: "絕境", buff: { name: "增益", description: "說明", icon: "https://cdn/buff.png" }, medal: "https://cdn/medal.png" },
    knights: [stage(1), stage(2), stage(3)],
  };

  it("主題圖、評級勳章、首領、騎士、增益與每一隊的頭像都換掉；屬性圖示是內建的靜態檔，原樣保留", () => {
    const [mapped] = peakAssetUrls({ seasons: [season] }, fakeAsset).seasons;

    expect(JSON.stringify(mapped)).not.toContain("https://");
    expect([mapped.theme, mapped.boss.medal, mapped.boss.icon, mapped.boss.buff?.icon]).toEqual(["http://mock/theme.png", "http://mock/medal.png", "http://mock/boss.png", "http://mock/buff.png"]);
    expect(mapped.knights.map((k) => k.icon)).toEqual(["http://mock/monster/1.png", "http://mock/monster/2.png", "http://mock/monster/3.png"]);
    expect(mapped.knights[0].avatars[0]).toMatchObject({ icon: "http://mock/1.png", elementIcon: "/icons/starrail/element/ice.png" });
    expect(peakAssetUrls({ seasons: [season] }, (url) => url)).toEqual({ seasons: [season] });
  });
});
