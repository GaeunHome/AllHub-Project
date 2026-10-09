import { describe, expect, it } from "vitest";
import type { Endgame } from "../lib/endgame";
import { endgameAssetUrls } from "./endgame-assets";

const member = (id: number) => ({ id, level: 80, icon: `https://cdn/${id}.png`, rarity: 5, element: "ice", eidolon: 0 });
const endgame: Endgame = {
  mode: "chaos",
  hasData: true,
  name: "期數",
  begin: "2026/10/6 04:00",
  end: "2026/10/20 03:00",
  stars: 36,
  maxFloor: "混沌回憶 12",
  battles: 14,
  floors: [{ name: "混沌回憶 12", stars: 3, rounds: 7, score: null, quickClear: false, nodes: [{ avatars: [member(1), member(2)], score: null, bossDefeated: null }] }],
};

describe("endgameAssetUrls：上場隊伍的頭像都經過 externalAssetUrl", () => {
  it("每個頭像都換掉，其他欄位不變", () => {
    const mapped = endgameAssetUrls(endgame, (url) => (url ? url.replace("https://cdn/", "http://mock/") : null));

    expect(JSON.stringify(mapped)).not.toContain("https://");
    expect(mapped.floors[0].nodes[0].avatars.map((a) => a.icon)).toEqual(["http://mock/1.png", "http://mock/2.png"]);
    expect(endgameAssetUrls(endgame, (url) => url)).toEqual(endgame);
  });
});
