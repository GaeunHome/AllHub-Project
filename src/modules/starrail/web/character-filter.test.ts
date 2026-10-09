import { describe, expect, it } from "vitest";
import { elementOptions, selectCharacters } from "./character-filter";

const c = (id: number, level: number | null, rarity: number | null, eidolon: number | null, element: string | null) => ({ id, level, rarity, eidolon, element });

const ROSTER = [
  c(1, 70, 4, 6, "fire"),
  c(2, 80, 5, 0, "quantum"),
  c(3, 80, 4, 2, "ice"),
  c(4, 80, 5, 1, "ice"),
  c(5, null, null, null, null),
];
const ids = (list: { id: number }[]) => list.map((x) => x.id);

describe("selectCharacters：篩選與排序", () => {
  it("預設依等級排序：同等級比稀有度、再比星魂、最後照 id；讀不到的排最後", () => {
    expect(ids(selectCharacters(ROSTER, { rarity: "all", element: "all", sort: "level" }))).toEqual([4, 2, 3, 1, 5]);
  });

  it("依稀有度排序：同稀有度比等級", () => {
    expect(ids(selectCharacters(ROSTER, { rarity: "all", element: "all", sort: "rarity" }))).toEqual([4, 2, 3, 1, 5]);
  });

  it("依星魂排序：同星魂比稀有度、等級", () => {
    expect(ids(selectCharacters(ROSTER, { rarity: "all", element: "all", sort: "eidolon" }))).toEqual([1, 3, 4, 2, 5]);
  });

  it("只看五星或四星", () => {
    expect(ids(selectCharacters(ROSTER, { rarity: "5", element: "all", sort: "level" }))).toEqual([4, 2]);
    expect(ids(selectCharacters(ROSTER, { rarity: "4", element: "all", sort: "level" }))).toEqual([3, 1]);
  });

  it("依屬性篩選，可以跟稀有度一起用", () => {
    expect(ids(selectCharacters(ROSTER, { rarity: "all", element: "ice", sort: "level" }))).toEqual([4, 3]);
    expect(ids(selectCharacters(ROSTER, { rarity: "4", element: "ice", sort: "level" }))).toEqual([3]);
  });

  it("不改動原本的陣列", () => {
    const copy = [...ROSTER];
    selectCharacters(ROSTER, { rarity: "all", element: "all", sort: "eidolon" });
    expect(ROSTER).toEqual(copy);
  });
});

describe("elementOptions：篩選選單只列出有的屬性", () => {
  it("照遊戲裡的順序；認不得的屬性排在後面", () => {
    expect(elementOptions([c(1, 1, 4, 0, "quantum"), c(2, 1, 4, 0, "fire"), c(3, 1, 4, 0, "aether"), c(4, 1, 4, 0, "fire"), c(5, 1, 4, 0, null)])).toEqual([
      "fire",
      "quantum",
      "aether",
    ]);
  });
});
