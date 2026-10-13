import { describe, expect, it } from "vitest";
import type { StarrailCharacter } from "../lib/characters";
import { characterAssetUrls } from "./character-assets";

const full: StarrailCharacter = {
  id: 1102,
  name: "希兒",
  level: 80,
  eidolon: 2,
  rarity: 5,
  element: "quantum",
  elementIcon: "/icons/starrail/element/quantum.png",
  path: 2,
  pathIcon: "/icons/starrail/path/hunt.png",
  icon: "https://cdn/icon.png",
  image: "https://cdn/image.png",
  lightCone: { id: 1, name: "光錐", level: 80, superimposition: 1, rarity: 5, icon: "https://cdn/cone.png" },
  relics: [{ id: 1, pos: 1, name: "頭", level: 15, rarity: 5, icon: "https://cdn/relic.png", mainStat: { name: "生命值", value: "705", times: 0, icon: "/icons/starrail/property/max-hp.png" }, subStats: [{ name: "暴擊率", value: "3.2%", times: 2, icon: "/icons/starrail/property/critical-chance.png" }] }],
  eidolons: [{ pos: 1, name: "星魂", icon: "https://cdn/rank.png", unlocked: true }],
  stats: [{ type: 1, name: "生命值", icon: "/icons/starrail/property/max-hp.png", base: "1", add: "2", final: "3" }],
  traces: [{ kind: "skill", name: "強寇", typeLabel: "普攻", level: 6, icon: "https://cdn/skill.png", activated: true }],
};

/** 物件裡所有的字串，用來確認沒有漏掉沒改寫的網址 */
function strings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (value && typeof value === "object") return Object.values(value).flatMap(strings);
  return [];
}

/** 跟 externalAssetUrl 一樣：只認 http(s) 的網址，站內路徑會變成 null */
const asset = (url: string | null) => (url?.startsWith("https://cdn/") ? url.replace("https://cdn/", "http://mock/") : null);

describe("characterAssetUrls：角色資料裡的外部圖片網址都經過 externalAssetUrl", () => {
  it("每一個外部圖片欄位都換掉，沒有漏掉的原始網址（新增圖片欄位時這裡會失敗）", () => {
    const [mapped] = characterAssetUrls([full], asset);

    expect(strings(mapped).filter((s) => s.startsWith("https://"))).toEqual([]);
    expect(mapped.icon).toBe("http://mock/icon.png");
    expect(mapped.lightCone?.icon).toBe("http://mock/cone.png");
    expect(mapped.relics[0].icon).toBe("http://mock/relic.png");
    expect(mapped.eidolons[0].icon).toBe("http://mock/rank.png");
    expect(mapped.traces[0].icon).toBe("http://mock/skill.png");
    expect(mapped.image).toBe("http://mock/image.png");
  });

  it("屬性、命途與詞條的遊戲圖示是內建的靜態檔：原樣保留，不經 externalAssetUrl", () => {
    const [mapped] = characterAssetUrls([full], asset);

    expect(mapped.elementIcon).toBe("/icons/starrail/element/quantum.png");
    expect(mapped.pathIcon).toBe("/icons/starrail/path/hunt.png");
    expect(mapped.stats[0].icon).toBe("/icons/starrail/property/max-hp.png");
    expect(mapped.relics[0].mainStat?.icon).toBe("/icons/starrail/property/max-hp.png");
    expect(mapped.relics[0].subStats[0].icon).toBe("/icons/starrail/property/critical-chance.png");
  });

  it("其他欄位原樣保留；沒有光錐時仍是 null", () => {
    const [mapped] = characterAssetUrls([{ ...full, lightCone: null }], (url) => url);

    expect(mapped).toEqual({ ...full, lightCone: null });
  });
});
