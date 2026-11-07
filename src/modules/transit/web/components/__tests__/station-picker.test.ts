import { createElement, isValidElement, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { markup, textOf } from "@/dev/test-helpers";
import { metroMap } from "../../../lib/metro-map";
import { StationPanel } from "../station-picker";
import { MapStations } from "../station-map";

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
    expect(textOf(panel({ stations: [], groups: [], frequent: [] }))).toContain("車站資料暫時無法讀取");
  });

  it("報讀器的結果放在一開始就在的 status", () => {
    expect(panel()).toContain('role="status"');
  });
});

describe("捷運選站的路線圖", () => {
  const STATIONS = [
    { id: "BL11", name: "西門" },
    { id: "BL12", name: "台北車站" },
    { id: "R10", name: "台北車站" },
    { id: "R11", name: "中山" },
    { id: "G12", name: "西門" },
    { id: "G14", name: "中山" },
    { id: "K01", name: "雙城" },
  ];
  const GROUPS = [
    { id: "BL", name: "板南線", color: "#0070bd", stations: [STATIONS[0], STATIONS[1]] },
    { id: "R", name: "淡水信義線", color: "#e3002c", stations: [STATIONS[2], STATIONS[3]] },
    { id: "G", name: "松山新店線", color: "#008659", stations: [STATIONS[4], STATIONS[5]] },
    { id: "K", name: "安坑線", color: "#c2a77a", stations: [STATIONS[6]] },
  ];
  const mapPanel = (props = {}) => markup(createElement(StationPanel, { stations: STATIONS, groups: GROUPS, frequent: [], value: "", onPick: vi.fn(), map: true, ...props }));
  const buttonOf = (html: string, label: string) => new RegExp(`<button[^>]*aria-label="${label}[（"][^>]*>`).exec(html)?.[0] ?? "";

  type ButtonProps = { "aria-label"?: string; disabled?: boolean; onClick?: () => void; children?: ReactNode };
  function buttonsIn(node: ReactNode): ButtonProps[] {
    if (Array.isArray(node)) return node.flatMap(buttonsIn);
    if (!isValidElement<ButtonProps>(node)) return [];
    return node.type === "button" ? [node.props] : buttonsIn(node.props.children);
  }

  it("同名的轉乘站在圖上只有一個按鈕 報讀器聽得到站名與每一條線", () => {
    const html = mapPanel();

    expect(html.match(/aria-label="台北車站（/g)).toHaveLength(1);
    expect(buttonOf(html, "台北車站")).toContain("板南線");
    expect(buttonOf(html, "台北車站")).toContain("淡水信義線");
  });

  it("圖在查詢表單裡面 每一站都要是 type=button 不然一點就送出查詢", () => {
    const buttons = [...mapPanel().matchAll(/<button[^>]*>/g)].map(([tag]) => tag);

    expect(buttons.filter((tag) => !tag.includes('type="button"'))).toEqual([]);
  });

  it("使用者要的：另一端選好的站在圖上不能選", () => {
    const html = mapPanel({ except: { id: "R10", name: "台北車站" } });

    expect(buttonOf(html, "台北車站")).toMatch(/\sdisabled=""/);
    expect(buttonOf(html, "西門")).not.toMatch(/\sdisabled=""/);
  });

  it("已經選的站在圖上標出來", () => {
    expect(buttonOf(mapPanel({ value: "R11" }), "中山")).toContain('aria-current="true"');
  });

  it("按圖上的站就選它 交出去的是這一站的代碼", () => {
    const onPick = vi.fn();
    const buttons = buttonsIn(MapStations({ map: metroMap(STATIONS), value: "", except: null, onPick }));

    buttons.find((button) => button["aria-label"]?.startsWith("西門"))?.onClick?.();

    expect(onPick).toHaveBeenCalledTimes(1);
    expect(["BL11", "G12"]).toContain(onPick.mock.calls[0][0]);
  });

  it("圖上沒有的站列在圖的下面 不能讓人選不了站", () => {
    expect(textOf(mapPanel())).toContain("雙城");
    expect(buttonOf(mapPanel(), "台北車站")).not.toBe("");
  });

  it("車站清單讀不到時說明 不是一片空白", () => {
    expect(textOf(mapPanel({ stations: [], groups: [], frequent: [] }))).toContain("車站資料暫時無法讀取");
  });
});
