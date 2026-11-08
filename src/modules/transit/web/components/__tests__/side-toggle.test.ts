import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { readStylesheet } from "@/dev/stylesheet";
import { SideToggle } from "../side-toggle";

// 發生過收起後鈕沒有箭頭 藏的是所有 span 圖示也是 span
// 轉向的規則又寫給 svg 選不到

const css = readStylesheet(fileURLToPath(new URL("../../transit.css", import.meta.url))).replace(/\/\*[\s\S]*?\*\//g, "");
const rules = [...css.matchAll(/([^{};]+)\{([^{}]*)\}/g)].flatMap((m) => m[1].split(",").map((selector) => ({ selector: selector.trim(), body: m[2] })));

type Child = { index: number; last: boolean; tag: string; classes: string[]; html: string };

/** 收起鈕裡的元素 都是一層 沒有再包 */
function toggleChildren(): { markup: string; children: Child[] } {
  const markup = renderToStaticMarkup(createElement(SideToggle, { controls: "transit-side" }));
  const inner = /^<button[^>]*>([\s\S]*)<\/button>$/.exec(markup)?.[1] ?? "";
  const found = [...inner.matchAll(/<(\w+)([^>]*)>([^<]*)<\/\1>/g)];
  expect(found.map((m) => m[0]).join(""), "收起鈕裡多包了一層 這個測試要跟著改").toBe(inner);
  const children = found.map((m, index) => ({
    index,
    last: index === found.length - 1,
    tag: m[1],
    classes: /\bclass="([^"]*)"/.exec(m[2])?.[1].split(/\s+/) ?? [],
    html: m[0],
  }));
  return { markup, children };
}

/** 選擇器最後一段選不選得到這個元素 只認標籤 class :first-child :last-child */
function matches(compound: string, child: Child): boolean {
  const tokens = compound.match(/^[a-z][\w-]*|\.[\w-]+|:[\w-]+(?:\([^)]*\))?|\[[^\]]*\]/g) ?? [];
  expect(tokens.join(""), `看不懂的選擇器 ${compound}`).toBe(compound);
  return tokens.every((token) => {
    if (token.startsWith(".")) return child.classes.includes(token.slice(1));
    if (token === ":first-child") return child.index === 0;
    if (token === ":last-child") return child.last;
    if (/^[a-z]/.test(token)) return child.tag === token;
    throw new Error(`看不懂的選擇器 ${compound}`);
  });
}

/** 寫給收起鈕裡面的規則 與它們選到的元素 */
function rulesInsideToggle(children: Child[]) {
  const ownClasses = new Set(children.flatMap((child) => child.classes).filter((name) => name.startsWith("trn-")));
  return rules.flatMap(({ selector, body }) => {
    const parts = selector.split(/\s*>\s*|\s+/);
    const subject = parts[parts.length - 1];
    const inside = parts.slice(0, -1).some((part) => part.includes(".trn-side-toggle")) || [...subject.matchAll(/\.([\w-]+)/g)].some((m) => ownClasses.has(m[1]));
    return inside ? [{ selector, body, picked: children.filter((child) => matches(subject, child)) }] : [];
  });
}

const HIDES = /display:\s*none|visibility:\s*hidden|@apply[^;]*\b(?:sr-only|hidden|invisible)\b/;

describe("側邊欄的收起鈕（使用者要的：常用路線的側邊欄可以收起來）", () => {
  const { children } = toggleChildren();
  const arrow = children.find((child) => child.classes.includes("icon"));
  const inside = rulesInsideToggle(children);

  it("收起與展開時藏起來的只有字，箭頭一直都在（圖示元件也是 span，不能用 span 選字）", () => {
    expect(arrow).toBeDefined();
    const hiding = inside.filter((rule) => HIDES.test(rule.body));

    expect(hiding.length).toBeGreaterThan(0);
    for (const rule of hiding) {
      expect(rule.picked, `${rule.selector} 什麼都沒選到`).not.toEqual([]);
      expect(rule.picked, `${rule.selector} 把箭頭藏起來了`).not.toContain(arrow);
    }
  });

  it("箭頭轉向的規則選得到箭頭（圖示畫成 span，不是 svg），也只轉箭頭", () => {
    const turning = inside.filter((rule) => /\brotate:|\btransform:/.test(rule.body));

    expect(turning.length).toBeGreaterThan(0);
    for (const rule of turning) expect(rule.picked, rule.selector).toEqual([arrow]);
  });
});
