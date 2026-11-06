import { createElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { markup, textOf } from "@/dev/test-helpers";

vi.mock("@/core/auth", () => import("@/dev/session-stub"));

const { PlaceManager } = await import("../manage-places");

const city = (id: number | null, name: string) => ({ key: id === null ? "home" : String(id), id, name, country: null });
const home = city(null, "臺北市");
const cities = [city(7, "東京"), city(8, "首爾"), city(9, "大阪")];
const html = (tabs = [home, ...cities]) => markup(createElement(PlaceManager, { tabs }));
const buttonOf = (page: string, label: string) => page.match(new RegExp(`<button[^>]*aria-label="${label}"[^>]*>`))?.[0] ?? "";

describe("管理城市的視窗（使用者要的：不用拖曳）", () => {
  it("每個加進來的城市都能上移 下移與移除", () => {
    const page = html();

    for (const { name } of cities.slice(1, 2)) {
      expect(buttonOf(page, `上移${name}`)).not.toBe("");
      expect(buttonOf(page, `下移${name}`)).not.toBe("");
      expect(buttonOf(page, `移除${name}`)).not.toBe("");
    }
  });

  it("首頁的縣市固定第一個 不能移動也不能移除", () => {
    const page = html();

    expect(page).not.toContain("上移臺北市");
    expect(page).not.toContain("下移臺北市");
    expect(page).not.toContain("移除臺北市");
    expect(textOf(page).indexOf("臺北市")).toBeLessThan(textOf(page).indexOf("東京"));
  });

  it("排第一的不能再上移 排最後的不能再下移", () => {
    const page = html();

    expect(buttonOf(page, "上移東京")).toContain("disabled");
    expect(buttonOf(page, "下移東京")).not.toContain("disabled");
    expect(buttonOf(page, "上移大阪")).not.toContain("disabled");
    expect(buttonOf(page, "下移大阪")).toContain("disabled");
  });

  it("新增也在同一個視窗", () => {
    expect(textOf(html())).toContain("新增城市");
  });

  it("滿 10 個就不能再新增 寫出上限", () => {
    const full = Array.from({ length: 10 }, (_, index) => city(index + 1, `城市${index + 1}`));

    expect(textOf(html(full))).not.toContain("新增城市");
    expect(textOf(html(full))).toContain("最多 10 個城市");
  });

  it("首頁的縣市不佔 10 個的名額", () => {
    const nine = Array.from({ length: 9 }, (_, index) => city(index + 1, `城市${index + 1}`));

    expect(textOf(html([home, ...nine]))).toContain("新增城市");
  });
});
