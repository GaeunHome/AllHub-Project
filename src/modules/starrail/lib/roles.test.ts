import { describe, expect, it } from "vitest";
import { defaultRoleSelection, likelyUnused, serverLabel } from "./roles";

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

describe("likelyUnused：等級很低、又不是最高等級的角色，可能是沒在玩的帳號", () => {
  it("70 級旁邊的 5 級_可能沒在玩；70 級本身不是", () => {
    const roles = [role("a", 70), role("b", 5)];
    expect(likelyUnused(roles[1], roles)).toBe(true);
    expect(likelyUnused(roles[0], roles)).toBe(false);
  });

  it("只有一個角色、或大家都很低時最高的那個_不標示", () => {
    expect(likelyUnused(role("a", 8), [role("a", 8)])).toBe(false);
    const low = [role("a", 15), role("b", 18)];
    expect(likelyUnused(low[1], low)).toBe(false);
    expect(likelyUnused(low[0], low)).toBe(true);
  });

  it("20 級以上或讀不到等級_不標示", () => {
    const roles = [role("a", 70), role("b", 25), role("c", null)];
    expect(likelyUnused(roles[1], roles)).toBe(false);
    expect(likelyUnused(roles[2], roles)).toBe(false);
  });
});

describe("defaultRoleSelection：預設勾等級最高的那個", () => {
  it("挑等級最高的；同等級挑前面的", () => {
    expect(defaultRoleSelection([role("a", 40), role("b", 70), role("c", 70)])).toEqual(["b"]);
  });

  it("讀不到等級_挑第一個；沒有角色_空的", () => {
    expect(defaultRoleSelection([role("a", null), role("b", null)])).toEqual(["a"]);
    expect(defaultRoleSelection([])).toEqual([]);
  });
});
