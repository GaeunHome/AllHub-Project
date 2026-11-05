import { createElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { markup, textOf } from "@/dev/test-helpers";
import { WORLD_CITIES, parsePlaceChoice } from "../../../lib/cities";
import { COUNTIES } from "../../../lib/counties";

vi.mock("@/core/auth", () => import("@/dev/session-stub"));

const { PlaceForm } = await import("../place-form");

const html = () => markup(createElement(PlaceForm, { onDone: vi.fn(), onCancel: vi.fn() }));
const groupOf = (label: string) => html().match(new RegExp(`<optgroup label="${label}">(.*?)</optgroup>`))?.[1] ?? "";
const optionValues = (part: string) => [...part.matchAll(/<option value="([^"]+)"/g)].map(([, value]) => value);

describe("新增城市的視窗", () => {
  it("縣市與國外城市分成兩組，每個內建地點都選得到", () => {
    expect(optionValues(groupOf("台灣"))).toEqual([...COUNTIES]);
    expect(optionValues(groupOf("國外"))).toEqual(WORLD_CITIES.map((place) => place.name));
  });

  it("每個選項都過得了伺服器的檢查", () => {
    for (const value of optionValues(html())) expect(parsePlaceChoice(value).ok, value).toBe(true);
  });

  it("使用者要的：城市固定用清單，沒有搜尋", () => {
    expect(html()).not.toContain("<input");
    expect(textOf(html())).not.toContain("搜尋");
  });
});
