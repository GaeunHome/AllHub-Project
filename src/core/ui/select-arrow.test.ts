import { describe, expect, it } from "vitest";
import { readStylesheet } from "@/dev/stylesheet";

// 先拿掉註解 規則前面的註解不能算進選擇器
const css = readStylesheet().replace(/\/\*[\s\S]*?\*\//g, "");
/** 選擇器清單裡有這個選擇器的規則內容 */
const declarations = (selector: string) =>
  [...css.matchAll(/([^{};]+)\{([^{}]*)\}/g)]
    .filter((m) => m[1].split(",").some((s) => s.trim() === selector))
    .map((m) => m[2])
    .join("\n");
const valueOf = (rule: string, property: string) => new RegExp(`(?:^|[;\\s])${property}:\\s*([^;]+);`).exec(rule)?.[1].trim() ?? "";
const rems = (value: string) => [...value.matchAll(/(\d+(?:\.\d+)?)rem/g)].map((m) => Number(m[1]));

describe("下拉選單的箭頭（globals.css 的 select.input）", () => {
  const select = declarations("select.input");

  it("拿掉瀏覽器貼著右邊框的箭頭，改成自己畫：全站的下拉選單都用 input 這個 class，只寫這一次", () => {
    expect(valueOf(select, "appearance")).toBe("none");
    expect(valueOf(select, "background-image")).not.toBe("");
  });

  it("箭頭離右邊框跟文字離左邊框一樣遠（0.875rem，input 的 px-3.5）；右邊內距讓開箭頭再留一點空，文字不會壓到", () => {
    const offsets = rems(valueOf(select, "background-position"));
    const [halfWidth] = rems(valueOf(select, "background-size"));
    // 箭頭由左右兩半拼成 右半貼著的位置就是離右邊框的距離
    const nearest = Math.min(...offsets);
    const arrowLeftEdge = Math.max(...offsets) + halfWidth;

    expect(nearest).toBe(0.875);
    expect(rems(valueOf(select, "padding-right"))[0]).toBeGreaterThanOrEqual(arrowLeftEdge + 0.25);
  });

  it("箭頭的顏色用 CSS 變數：淺色、深色與 Twitch、星穹鐵道、YouTube 的主題頁都跟著換，不寫死色碼或圖檔", () => {
    const image = valueOf(select, "background-image");

    expect(image).toMatch(/var\(--[\w-]+\)/);
    expect(image).not.toMatch(/#[\da-f]{3,8}\b|rgba?\(|url\(/i);
  });
});
