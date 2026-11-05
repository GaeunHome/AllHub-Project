import { createElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { markup, textOf } from "@/dev/test-helpers";
import { StationPanel } from "../station-picker";

const DATA = { stations: [{ id: "R10", name: "台北車站" }, { id: "BL12", name: "台北車站" }], groups: [{ id: "R", name: "淡水信義線", color: "#e3002c", stations: [{ id: "R10", name: "台北車站" }] }, { id: "BL", name: "板南線", color: "#0070bd", stations: [{ id: "BL12", name: "台北車站" }] }], frequent: [{ id: "BL12", name: "台北車站" }] };
const panel = (props = {}) => markup(createElement(StationPanel, { ...DATA, value: "", onPick: vi.fn(), ...props }));

describe("選車站的面板", () => {
  it("使用者要的：打開時焦點在搜尋框 搜尋框有名稱", () => {
    expect(panel()).toMatch(/<input[^>]*aria-label="搜尋車站"[^>]*data-autofocus|<input[^>]*data-autofocus[^>]*aria-label="搜尋車站"/);
  });

  it("面板在查詢表單裡面 每個站都要是 type=button 不然一點就送出查詢", () => {
    const html = panel();
    const buttons = [...html.matchAll(/<button[^>]*>/g)].map(([tag]) => tag);

    expect(buttons).toHaveLength(3);
    expect(buttons.filter((tag) => !tag.includes('type="button"'))).toEqual([]);
  });

  it("先列常用 再列路線", () => {
    const titles = [...panel().matchAll(/<h3[^>]*>(.*?)<\/h3>/g)].map(([, title]) => textOf(title));

    expect(titles).toEqual(["常用", "淡水信義線", "板南線"]);
  });

  it("常用裡同名的轉乘站 報讀器聽得出是哪一條線", () => {
    expect(panel()).toContain("（板南線）");
  });

  it("跨系統時常用的站也找得到路線 機場線不是臺北捷運的代碼", () => {
    const stations = [{ id: "A1", name: "臺北車站" }];
    const groups = [{ id: "A", name: "機場線", color: "#8246af", stations }];

    expect(panel({ stations, groups, frequent: stations })).toContain("（機場線）");
  });

  it("台鐵的分組沒有路線 站上不放路線的顏色", () => {
    const stations = [{ id: "1000", name: "臺北" }];

    expect(panel({ stations, groups: [{ id: "臺北市", name: "臺北市", stations }], frequent: stations })).not.toContain("trn-dot");
  });

  it("已經選的站標出來", () => {
    expect(panel({ value: "R10" })).toContain('aria-current="true"');
  });

  it("車站清單讀不到時說明 不是一片空白", () => {
    expect(textOf(panel({ stations: [], groups: [], frequent: [] }))).toContain("車站資料暫時讀不到");
  });

  it("報讀器的結果放在一開始就在的 status", () => {
    expect(panel()).toContain('role="status"');
  });
});
