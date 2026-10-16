import { describe, expect, it } from "vitest";
import { defaultRoleSelection, serverLabel } from "./roles";

describe("serverLabel：伺服器的中文名稱", () => {
  it.each([
    ["prod_official_asia", "亞服"],
    ["prod_official_usa", "美服"],
    ["prod_official_eur", "歐服"],
    ["prod_official_cht", "台港澳服"],
  ])("%s → %s", (region, label) => {
    expect(serverLabel(region)).toBe(label);
  });

  it("認不得的伺服器_用 HoYoLAB 給的名稱，沒有就原樣顯示", () => {
    expect(serverLabel("prod_official_moon", "Moon")).toBe("Moon");
    expect(serverLabel("prod_official_moon")).toBe("prod_official_moon");
  });
});

const role = (uid: string, level: number | null) => ({ uid, level });

describe("defaultRoleSelection：預設勾等級最高的那個", () => {
  it("挑等級最高的；同等級挑前面的", () => {
    expect(defaultRoleSelection([role("a", 40), role("b", 70), role("c", 70)])).toEqual(["b"]);
  });

  it("讀不到等級_挑第一個；沒有角色_空的", () => {
    expect(defaultRoleSelection([role("a", null), role("b", null)])).toEqual(["a"]);
    expect(defaultRoleSelection([])).toEqual([]);
  });
});
