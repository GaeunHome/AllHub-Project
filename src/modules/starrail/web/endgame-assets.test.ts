import { describe, expect, it } from "vitest";
import type { Endgame } from "../lib/endgame";
import { endgameAssetUrls } from "./endgame-assets";

const member = (id: number) => ({ id, level: 80, icon: `https://cdn/${id}.png`, rarity: 5, element: "ice", elementIcon: "/icons/starrail/element/ice.png", eidolon: 0 });
/** 跟 externalAssetUrl 一樣只認 http(s) 的網址 站內路徑會變成 null */
const asset = (url: string | null) => (url?.startsWith("https://cdn/") ? url.replace("https://cdn/", "http://mock/") : null);
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
  it("每個頭像都換掉；屬性圖示是內建的靜態檔，原樣保留（不經 externalAssetUrl）；其他欄位不變", () => {
    const mapped = endgameAssetUrls(endgame, asset);

    expect(JSON.stringify(mapped)).not.toContain("https://");
    expect(mapped.floors[0].nodes[0].avatars.map((a) => a.icon)).toEqual(["http://mock/1.png", "http://mock/2.png"]);
    expect(mapped.floors[0].nodes[0].avatars.map((a) => a.elementIcon)).toEqual(["/icons/starrail/element/ice.png", "/icons/starrail/element/ice.png"]);
    expect(endgameAssetUrls(endgame, (url) => url)).toEqual(endgame);
  });
});
