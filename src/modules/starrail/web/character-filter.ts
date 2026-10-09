import { ELEMENT_ORDER, type StarrailCharacter } from "../lib/characters";

export type RarityFilter = "all" | "5" | "4";
export type SortKey = "level" | "rarity" | "eidolon";
export type CharacterFilter = { rarity: RarityFilter; element: string; sort: SortKey };

type Sortable = Pick<StarrailCharacter, "id" | "level" | "rarity" | "eidolon" | "element">;

/** 主要排序之後依序比較的欄位；最後照 id，順序才固定 */
const TIE_BREAKERS: Record<SortKey, Array<"level" | "rarity" | "eidolon">> = {
  level: ["level", "rarity", "eidolon"],
  rarity: ["rarity", "level", "eidolon"],
  eidolon: ["eidolon", "rarity", "level"],
};

/** 讀不到的數字（null）排在最後 */
const rank = (value: number | null) => value ?? -1;

export function selectCharacters<T extends Sortable>(list: T[], { rarity, element, sort }: CharacterFilter): T[] {
  return list
    .filter((c) => (rarity === "all" || c.rarity === Number(rarity)) && (element === "all" || c.element === element))
    .sort((a, b) => {
      for (const key of TIE_BREAKERS[sort]) {
        const diff = rank(b[key]) - rank(a[key]);
        if (diff !== 0) return diff;
      }
      return a.id - b.id;
    });
}

/** 依遊戲裡的順序列出有的屬性；HoYoLAB 新增的屬性排在後面，篩選時才不會消失 */
export function elementOptions(list: Pick<StarrailCharacter, "element">[]): string[] {
  const present = new Set(list.flatMap((c) => (c.element ? [c.element] : [])));
  return [...ELEMENT_ORDER.filter((e) => present.has(e)), ...[...present].filter((e) => !ELEMENT_ORDER.includes(e))];
}
