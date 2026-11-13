import { describe, expect, it } from "vitest";
import type { Relic, RelicStat, StarrailCharacter } from "../characters";
import { gradeOf, rateCharacters, rateRelic, type CharacterWeights } from "../relic-score";
import { RELIC_WEIGHTS } from "../relic-weights";

// 使用者選的 照 hsr-optimizer 的方法算 每條副詞條換成幾次滿值強化 乘上角色的權重
// 除以這個部位理論上最好的一件 答案都用它的副詞條滿值手算

// hsr-optimizer 的 Seele.ts 與 March7th.ts 照抄的權重 順序見 relic-weights.ts
const SEELE: CharacterWeights = { w: [0, 0.75, 0, 1, 1, 1, 0, 0, 0], body: ["cr", "cd", "ehr"], feet: ["atkP", "spd"], sphere: ["atkP", "quantum"], rope: ["atkP"] };
const MARCH: CharacterWeights = { w: [0, 0, 1, 1, 0, 0, 1, 0.5, 0], body: ["defP", "ehr"], feet: ["defP", "spd"], sphere: ["defP"], rope: ["defP", "err"], flat: "def" };

const stat = (type: number, value: string): RelicStat => ({ type, name: `屬性 ${type}`, value, times: 1, icon: null });
const relic = (pos: number, main: RelicStat, subStats: RelicStat[], rarity = 5): Relic => ({ id: pos, pos, name: "遺器", level: 15, rarity, icon: null, mainStat: main, subStats });

// HoYoLAB 的 property_type 27 生命 29 攻擊 31 防禦 32 33 34 是百分比 51 速度 52 暴擊率 53 暴擊傷害 56 效果命中
const SEELE_HEAD = relic(1, stat(27, "705"), [stat(52, "8.7%"), stat(53, "11.7%"), stat(51, "4"), stat(31, "21")]);

describe("rateRelic", () => {
  it("頭部：暴擊率 8.7÷3.24＋暴擊傷害 11.7÷6.48＋速度 4÷2.6，除以理想的 6＋1＋1＋0.75，約 68.9%，是 SS", () => {
    const rating = rateRelic(SEELE_HEAD, SEELE);

    expect(rating?.grade).toBe("SS");
    expect(rating && "percent" in rating ? rating.percent : null).toBeCloseTo(68.9, 1);
  });

  it("主屬性已經是暴擊率時，理想的那件不能再有暴擊率：(2＋1＋0.75)÷(6＋1＋0.75＋0.3) 約 46.6%，是 A", () => {
    const body = relic(3, stat(52, "32.4%"), [stat(53, "12.96%"), stat(51, "2.6"), stat(33, "4.32%"), stat(27, "42.33751")]);

    const rating = rateRelic(body, SEELE);

    expect(rating?.grade).toBe("A");
    expect(rating && "percent" in rating ? rating.percent : null).toBeCloseTo(46.58, 1);
  });

  it("軀幹、腳、位面球、連結繩的主屬性角色用不到：不給等級，寫主屬性不合", () => {
    expect(rateRelic(relic(3, stat(32, "43.2%"), [stat(52, "8.7%")]), SEELE)).toEqual({ grade: null, wrongMain: true });
  });

  it("主屬性是防禦力百分比、而且角色設了 flat 時，固定防禦的副詞條算滿（不是四成）：2÷(6＋1＋0.5＋1) 約 23.5%", () => {
    const flatDef = stat(31, "42.337508");

    const withBoost = rateRelic(relic(3, stat(34, "54%"), [flatDef]), MARCH);
    const without = rateRelic(relic(4, stat(51, "25"), [flatDef]), MARCH);

    expect(withBoost && "percent" in withBoost ? withBoost.percent : null).toBeCloseTo(23.53, 1);
    // 腳的主屬性是速度 固定防禦只算四成 0.8 / (6 + 1 + 0.5 + 0.4)
    expect(without && "percent" in without ? without.percent : null).toBeCloseTo(10.13, 1);
  });

  it("不是五星的遺器不評分（hsr-optimizer 也只評五星）", () => {
    expect(rateRelic({ ...SEELE_HEAD, rarity: 4 }, SEELE)).toBeNull();
  });
});

describe("gradeOf（使用者選的五個等級 SS、S、A、B、C）", () => {
  it("照 hsr-optimizer 每 5% 一級的門檻併成五級：60 以上 SS、50 S、40 A、30 B、其他 C", () => {
    expect([60, 59.9, 50, 49.9, 40, 39.9, 30, 29.9, 0].map(gradeOf)).toEqual(["SS", "S", "S", "A", "A", "B", "B", "C", "C"]);
  });
});

describe("rateCharacters", () => {
  const character = (id: number, relics: Relic[]) => ({ id, relics }) as unknown as StarrailCharacter;

  it("每件遺器標上等級、角色用得到的副詞條標起來；總評是各件的平均，主屬性不合的算 0", () => {
    const wrongBody = relic(3, stat(32, "43.2%"), [stat(52, "8.7%")]);
    const [rated] = rateCharacters([character(1102, [SEELE_HEAD, wrongBody])], { 1102: SEELE });

    expect(rated.relics[0].rating?.grade).toBe("SS");
    expect(rated.relics[0].subStats.map((sub) => sub.useful)).toEqual([true, true, true, false]);
    // (68.9 + 0) / 2 約 34.5
    expect(rated.relicGrade).toBe("B");
  });

  it("權重表裡沒有的角色（剛推出的新角色）不評分", () => {
    const [rated] = rateCharacters([character(9999, [SEELE_HEAD])], { 1102: SEELE });

    expect(rated.relics[0].rating).toBeUndefined();
    expect(rated.relicGrade).toBeUndefined();
  });
});

describe("RELIC_WEIGHTS（從 hsr-optimizer 產生的權重表）", () => {
  it("希兒與三月七跟 hsr-optimizer 的角色檔一樣", () => {
    expect(RELIC_WEIGHTS[1102]).toEqual(SEELE);
    expect(RELIC_WEIGHTS[1001]).toEqual(MARCH);
  });
});
