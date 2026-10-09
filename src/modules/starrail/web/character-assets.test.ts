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
  path: 2,
  icon: "https://cdn/icon.png",
  image: "https://cdn/image.png",
  lightCone: { id: 1, name: "光錐", level: 80, superimposition: 1, rarity: 5, icon: "https://cdn/cone.png" },
  relics: [{ id: 1, pos: 1, name: "頭", level: 15, rarity: 5, icon: "https://cdn/relic.png", mainStat: { name: "生命值", value: "705", times: 0 }, subStats: [] }],
  eidolons: [{ pos: 1, name: "星魂", icon: "https://cdn/rank.png", unlocked: true }],
  stats: [{ type: 1, name: "生命值", base: "1", add: "2", final: "3" }],
  traces: [{ kind: "skill", name: "強寇", typeLabel: "普攻", level: 6, icon: "https://cdn/skill.png", activated: true }],
};

/** 物件裡所有的字串，用來確認沒有漏掉沒改寫的網址 */
function strings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (value && typeof value === "object") return Object.values(value).flatMap(strings);
  return [];
}

describe("characterAssetUrls：角色資料裡的圖片網址都經過 externalAssetUrl", () => {
  it("每一個圖片欄位都換掉，沒有漏掉的原始網址（新增圖片欄位時這裡會失敗）", () => {
    const [mapped] = characterAssetUrls([full], (url) => (url ? url.replace("https://cdn/", "http://mock/") : null));

    expect(strings(mapped).filter((s) => s.startsWith("https://"))).toEqual([]);
    expect(mapped.icon).toBe("http://mock/icon.png");
    expect(mapped.lightCone?.icon).toBe("http://mock/cone.png");
    expect(mapped.relics[0].icon).toBe("http://mock/relic.png");
    expect(mapped.eidolons[0].icon).toBe("http://mock/rank.png");
    expect(mapped.traces[0].icon).toBe("http://mock/skill.png");
    expect(mapped.image).toBe("http://mock/image.png");
  });

  it("其他欄位原樣保留；沒有光錐時仍是 null", () => {
    const [mapped] = characterAssetUrls([{ ...full, lightCone: null }], (url) => url);

    expect(mapped).toEqual({ ...full, lightCone: null });
  });
});
