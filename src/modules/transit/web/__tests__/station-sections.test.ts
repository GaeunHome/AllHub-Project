import { describe, expect, it } from "vitest";
import { pickerSections, soleStation } from "../station-sections";

const TAIPEI = { id: "1000", name: "臺北" };
const BANQIAO = { id: "1020", name: "板橋" };
const SHULIN = { id: "1040", name: "樹林" };
const GROUPS = [
  { id: "新北市", name: "新北市", stations: [BANQIAO, SHULIN] },
  { id: "臺北市", name: "臺北市", stations: [TAIPEI] },
];
const ALL = [TAIPEI, BANQIAO, SHULIN];
const summary = (sections: ReturnType<typeof pickerSections>) => sections.map((section) => [section.name, section.stations.map(({ name }) => name)]);

describe("pickerSections：另一端已經選好的站", () => {
  it("使用者要的：起站選了臺北 迄站就不列臺北 常用與分組都一樣", () => {
    expect(summary(pickerSections(ALL, GROUPS, [TAIPEI], "", TAIPEI))).toEqual([["新北市", ["板橋", "樹林"]]]);
  });

  it("使用者要的：搜尋也找不到另一端選好的站", () => {
    expect(summary(pickerSections(ALL, GROUPS, [], "台北", TAIPEI))).toEqual([]);
  });

  it("捷運的轉乘站同名不同代碼 台與臺同字 算同一站", () => {
    const red = { id: "R10", name: "台北車站" };
    const blue = { id: "BL12", name: "臺北車站" };
    const lines = [
      { id: "R", name: "淡水信義線", stations: [red, { id: "R11", name: "中正紀念堂" }] },
      { id: "BL", name: "板南線", stations: [blue] },
    ];

    expect(summary(pickerSections([red, blue], lines, [], "", red))).toEqual([["淡水信義線", ["中正紀念堂"]]]);
  });

  it("另一端還沒選時全部列出", () => {
    expect(summary(pickerSections(ALL, [], [], "", null))).toEqual([["全部車站", ["臺北", "板橋", "樹林"]]]);
  });
});

describe("pickerSections：面板要列的區塊", () => {
  it("使用者要的：先常用 再分組", () => {
    expect(summary(pickerSections(ALL, GROUPS, [TAIPEI], ""))).toEqual([
      ["常用", ["臺北"]],
      ["新北市", ["板橋", "樹林"]],
      ["臺北市", ["臺北"]],
    ]);
  });

  it("使用者要的：沒有常用時不顯示這一區", () => {
    expect(summary(pickerSections(ALL, GROUPS, [], "")).map(([name]) => name)).toEqual(["新北市", "臺北市"]);
  });

  it("使用者要的：讀不到分組時退回完整清單 搜尋照樣能用", () => {
    expect(summary(pickerSections(ALL, [], [], ""))).toEqual([["全部車站", ["臺北", "板橋", "樹林"]]]);
    expect(summary(pickerSections(ALL, [], [], "樹"))).toEqual([["全部車站", ["樹林"]]]);
  });

  it("打字時只留對得上的站 沒有站的組不留標題", () => {
    expect(summary(pickerSections(ALL, GROUPS, [], "台北"))).toEqual([["臺北市", ["臺北"]]]);
  });

  it("搜尋時同一站只列一次 常用的排最前面", () => {
    expect(summary(pickerSections(ALL, GROUPS, [TAIPEI], "台北"))).toEqual([["常用", ["臺北"]]]);
  });

  it("轉乘站同一個代碼在兩條線 平常兩組都列 搜尋時只列一次", () => {
    const groups = [
      { id: "G", name: "松山新店線", stations: [{ id: "G09", name: "古亭" }] },
      { id: "O", name: "中和新蘆線", stations: [{ id: "G09", name: "古亭" }] },
    ];

    expect(summary(pickerSections([{ id: "G09", name: "古亭" }], groups, [], ""))).toHaveLength(2);
    expect(summary(pickerSections([{ id: "G09", name: "古亭" }], groups, [], "古亭"))).toEqual([["松山新店線", ["古亭"]]]);
  });

  it("同名不同代碼的站都留著 分屬不同路線", () => {
    const groups = [
      { id: "BL", name: "板南線", stations: [{ id: "BL12", name: "台北車站" }] },
      { id: "R", name: "淡水信義線", stations: [{ id: "R10", name: "台北車站" }] },
    ];

    expect(summary(pickerSections([], groups, [], "台北車站"))).toEqual([
      ["板南線", ["台北車站"]],
      ["淡水信義線", ["台北車站"]],
    ]);
  });

  it("找不到時是空的 車站清單讀不到也是", () => {
    expect(pickerSections(ALL, GROUPS, [], "火星")).toEqual([]);
    expect(pickerSections([], [], [], "")).toEqual([]);
  });
});

describe("soleStation：按 Enter 直接選的站", () => {
  it("只剩一站就是它", () => {
    expect(soleStation(pickerSections(ALL, GROUPS, [], "台北"))).toEqual(TAIPEI);
  });

  it("還有好幾站時不替使用者挑", () => {
    expect(soleStation(pickerSections(ALL, GROUPS, [], ""))).toBeNull();
    expect(soleStation([])).toBeNull();
  });
});
