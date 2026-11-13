import type { Relic, RelicStat, StarrailCharacter } from "./characters";
import { RELIC_WEIGHTS } from "./relic-weights";

// 使用者要的遺器評分 照 hsr-optimizer 的方法 每條副詞條換成幾次滿值強化 乘上角色的權重
// 除以這個部位理論上最好的一件 再照它每 5% 一級的門檻併成使用者選的五級

const SUB_ORDER = ["hpP", "atkP", "defP", "spd", "cr", "cd", "ehr", "res", "be"] as const;
type SubKey = (typeof SUB_ORDER)[number];
type FlatKey = "hp" | "atk" | "def";
type ScoredKey = SubKey | FlatKey;

/** 權重照 SUB_ORDER 四個部位是適合的主屬性 flat 是主屬性為那個百分比時固定值的副詞條算滿 */
export type CharacterWeights = { w: readonly number[]; body: readonly string[]; feet: readonly string[]; sphere: readonly string[]; rope: readonly string[]; flat?: FlatKey };

export type RelicGrade = "SS" | "S" | "A" | "B" | "C";
export type RelicRating = { grade: RelicGrade; percent: number } | { grade: null; wrongMain: true };

// HoYoLAB 的 property_type 對到屬性 照 hoyo-buddy 整理的 genshin.py 對照表
const STAT_OF_TYPE: Record<number, string> = {
  27: "hp",
  29: "atk",
  31: "def",
  32: "hpP",
  33: "atkP",
  34: "defP",
  51: "spd",
  52: "cr",
  53: "cd",
  54: "err",
  55: "ohb",
  56: "ehr",
  57: "res",
  59: "be",
  12: "physical",
  14: "fire",
  16: "ice",
  18: "lightning",
  20: "wind",
  22: "quantum",
  24: "imaginary",
};

/** 五星遺器副詞條一次強化的最大值 照 hsr-optimizer 的 SubStatValues */
const HIGH_ROLL: Record<ScoredKey, number> = { hp: 42.33751, atk: 21.168754, def: 21.168754, hpP: 4.32, atkP: 4.32, defP: 5.4, spd: 2.6, cr: 3.24, cd: 6.48, ehr: 4.32, res: 4.32, be: 6.48 };

const FLAT_OF: Partial<Record<SubKey, FlatKey>> = { hpP: "hp", atkP: "atk", defP: "def" };
// 固定值的副詞條只算百分比的四成 跟 hsr-optimizer 一樣
const FLAT_SCALE = 0.4;

const PART_OF_POS: Record<number, "body" | "feet" | "sphere" | "rope"> = { 3: "body", 4: "feet", 5: "sphere", 6: "rope" };

const GRADES: { min: number; grade: RelicGrade }[] = [
  { min: 60, grade: "SS" },
  { min: 50, grade: "S" },
  { min: 40, grade: "A" },
  { min: 30, grade: "B" },
];

export const gradeOf = (percent: number): RelicGrade => GRADES.find(({ min }) => percent >= min)?.grade ?? "C";

const statOf = (stat: RelicStat | null) => (stat?.type == null ? null : (STAT_OF_TYPE[stat.type] ?? null));

function weightsFor(character: CharacterWeights, main: string | null): Record<ScoredKey, number> {
  const weights = Object.fromEntries(SUB_ORDER.map((key, i) => [key, character.w[i] ?? 0])) as Record<ScoredKey, number>;
  for (const [pct, flat] of Object.entries(FLAT_OF) as [SubKey, FlatKey][]) {
    weights[flat] = character.flat === flat && main === pct ? weights[pct] : weights[pct] * FLAT_SCALE;
  }
  return weights;
}

const isScored = (key: string | null): key is ScoredKey => key !== null && key in HIGH_ROLL;

/** 頭與手的主屬性固定 其他部位要是適合的或角色用得到的 */
function mainFits(relic: Relic, character: CharacterWeights, main: string | null, weights: Record<ScoredKey, number>): boolean {
  const part = PART_OF_POS[relic.pos ?? 0];
  if (!part) return true;
  return main !== null && (character[part].includes(main) || (isScored(main) && weights[main] > 0));
}

/** 只評五星 不是五星或沒有主屬性回 null */
export function rateRelic(relic: Relic, character: CharacterWeights): RelicRating | null {
  if (relic.rarity !== 5 || !relic.mainStat) return null;
  const main = statOf(relic.mainStat);
  const weights = weightsFor(character, main);
  if (!mainFits(relic, character, main, weights)) return { grade: null, wrongMain: true };
  // 理想的一件 副詞條不能跟主屬性一樣 最好的那條強化五次 其他三條各一次
  const best = (Object.keys(HIGH_ROLL) as ScoredKey[])
    .filter((key) => key !== main)
    .map((key) => weights[key])
    .sort((a, b) => b - a);
  const ideal = 6 * best[0] + best[1] + best[2] + best[3];
  if (!(ideal > 0)) return null;
  const score = relic.subStats.reduce((sum, sub) => {
    const key = statOf(sub);
    const value = Number.parseFloat(sub.value ?? "");
    return isScored(key) && Number.isFinite(value) ? sum + (weights[key] * value) / HIGH_ROLL[key] : sum;
  }, 0);
  const percent = (score / ideal) * 100;
  return { grade: gradeOf(percent), percent };
}

/** 角色用得到的副詞條 畫面標起來 */
function markUseful(relic: Relic, character: CharacterWeights): RelicStat[] {
  const weights = weightsFor(character, statOf(relic.mainStat));
  return relic.subStats.map((sub) => {
    const key = statOf(sub);
    return { ...sub, useful: isScored(key) && weights[key] > 0 };
  });
}

/** 權重表裡沒有的角色不評分 總評是各件的平均 主屬性不合的算 0 */
export function rateCharacters(characters: StarrailCharacter[], table: Readonly<Record<number, CharacterWeights>> = RELIC_WEIGHTS): StarrailCharacter[] {
  return characters.map((c) => {
    const weights = table[c.id];
    if (!weights) return c;
    const relics = c.relics.map((relic) => ({ ...relic, subStats: markUseful(relic, weights), rating: rateRelic(relic, weights) }));
    const percents = relics.flatMap(({ rating }) => (rating ? [rating.grade === null ? 0 : rating.percent] : []));
    const relicGrade = percents.length > 0 ? gradeOf(percents.reduce((sum, p) => sum + p, 0) / percents.length) : undefined;
    return { ...c, relics, relicGrade };
  });
}
