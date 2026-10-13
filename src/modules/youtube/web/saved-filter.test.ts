import { describe, expect, it } from "vitest";
import { matchesQuery } from "./saved-filter";

describe("matchesQuery：已保留的影片在瀏覽器裡用標題（與頻道名稱）篩選", () => {
  const text = "NewJeans 뉴진스 'How Sweet' 무대 모음 하이브 레이블즈";

  it.each([
    ["沒有輸入", "", true],
    ["只有空白", "   ", true],
    ["標題裡的一段", "무대", true],
    ["不分大小寫", "newjeans", true],
    ["前後的空白不算", "  sweet  ", true],
    ["好幾個詞要都有（順序不拘）", "모음 how", true],
    ["其中一個詞沒有", "모음 ive", false],
    ["完全沒有", "aespa", false],
  ] as const)("%s（%j）→ %s", (_name, query, expected) => {
    expect(matchesQuery(text, query)).toBe(expected);
  });
});
