import { describe, expect, it } from "vitest";
import { parseCharacter } from "../relic-weights";

// 照 hsr-optimizer 角色檔的真實寫法 只留 scoring 與 CharacterConfig 的開頭
const MARCH = `
const scoring = (): ScoringMetadata => ({
  stats: {
    [Stats.ATK]: 0,
    [Stats.ATK_P]: 0,
    [Stats.DEF]: 1,
    [Stats.DEF_P]: 1,
    [Stats.HP]: 0,
    [Stats.HP_P]: 0,
    [Stats.SPD]: 1,
    [Stats.CR]: 0,
    [Stats.CD]: 0,
    [Stats.EHR]: 1,
    [Stats.RES]: 0.50,
    [Stats.BE]: 0,
  },
  flatMainstatBoost: Stats.DEF,
  parts: {
    [Parts.Body]: [
      Stats.DEF_P,
      Stats.EHR,
    ],
    [Parts.Feet]: [
      Stats.DEF_P,
      Stats.SPD,
    ],
    [Parts.PlanarSphere]: [
      Stats.DEF_P,
      Stats.Quantum_DMG,
    ],
    [Parts.LinkRope]: [
      Stats.DEF_P,
      Stats.ERR,
    ],
  },
  presets: [],
})

export const March7th: CharacterConfig = {
  id: '1001',
  defaultLightCone: X.id,
}
`;

describe("parseCharacter（從 hsr-optimizer 的角色檔抽出權重）", () => {
  it("百分比與其他副詞條的權重照固定順序，四個部位的主屬性，固定值算滿的設定", () => {
    expect(parseCharacter(MARCH, "March7th.ts")).toEqual({
      id: "1001",
      weights: [0, 0, 1, 1, 0, 0, 1, 0.5, 0],
      parts: { body: ["defP", "ehr"], feet: ["defP", "spd"], sphere: ["defP", "quantum"], rope: ["defP", "err"] },
      flat: "def",
    });
  });

  it("強化版（id 帶 b1）HoYoLAB 分不出來，不收", () => {
    expect(parseCharacter(MARCH.replace("id: '1001'", "id: '1001b1'"), "March7thB1.ts")).toBeNull();
  });
});
