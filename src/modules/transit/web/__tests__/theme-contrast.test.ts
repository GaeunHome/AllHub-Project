import { describe, expect, it } from "vitest";
import { readStylesheet } from "@/dev/stylesheet";
import { blend, contrastRatio, rgbOf, WHITE } from "../../dev/contrast";

// WCAG 的對比公式 字要 4.5:1 以上 顏色都從樣式表讀 改了樣式才測得到


const css = readStylesheet();
const escaped = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const variable = (name: string, from = 0) => rgbOf(new RegExp(`${name}: (#[0-9a-f]{6})`).exec(css.slice(from))?.[1] ?? "");
const rulesOf = (selector: string) => [...css.matchAll(new RegExp(`${escaped(selector)} \\{([^}]*)\\}`, "g"))].map((match) => match[1]);

describe("高鐵的車票", () => {
  const darkStart = css.indexOf("--ink: #f1f2f4");
  const lightInk = variable("--ink");
  const darkInk = variable("--ink", darkStart);
  const papers = rulesOf(".trn-layout").flatMap((rule) => [.../--trn-paper: (#[0-9a-f]{6})/.exec(rule)?.slice(1) ?? []]).map(rgbOf);

  it("淺色與深色模式各一種紙", () => {
    expect(papers).toHaveLength(2);
  });

  it("淺色模式的紙配全站的深色字", () => {
    expect(contrastRatio(lightInk, papers[0])).toBeGreaterThanOrEqual(4.5);
  });

  it("深色模式的紙配全站的淺色字", () => {
    expect(contrastRatio(darkInk, papers[1])).toBeGreaterThanOrEqual(4.5);
  });
});

describe("台鐵的站牌", () => {
  it("深藍底配白字", () => {
    expect(contrastRatio(WHITE, variable("--trn-sign"))).toBeGreaterThanOrEqual(4.5);
  });
});

describe("常用路線的實體票卡", () => {
  const cardRule = (selector: string) => new RegExp(`${escaped(selector)}[^{]*\\{([^}]*)\\}`).exec(css)?.[1] ?? "";

  it("公車卡跟查詢結果的儲值卡是同一條規則，白字的對比不用再算一次", () => {
    expect(css).toMatch(/\.trn-bus-card,\s*\.trn-card\[data-mode="bus"\],\s*\.trn-mini\[data-mode="bus"\] \{/);
  });

  it("車票跟查詢結果用同一種紙", () => {
    expect(cardRule('.trn-card[data-mode="thsr"]')).toContain("var(--trn-paper)");
  });

  it("站牌的標題列跟查詢結果同一個深藍", () => {
    expect(cardRule('.trn-card[data-mode="tra"] > header')).toContain("var(--trn-sign)");
  });
});

describe("場景圖上的白字", () => {
  const scrim = "rgb\\(7 13 28 / ([\\d.]+)\\)";
  const [phone, wide] = rulesOf(".trn-scene .scene-scrim");
  const worstCase = (opacity: number) => contrastRatio(WHITE, blend([7, 13, 28], opacity, WHITE));

  it("手機上字佔滿寬度 整片壓暗 圖最亮的地方也要 4.5:1", () => {
    expect(worstCase(Number(new RegExp(scrim).exec(phone)?.[1]))).toBeGreaterThanOrEqual(4.5);
  });

  it("寬螢幕字只佔左邊 字的範圍內都要 4.5:1", () => {
    const stops = [...wide.matchAll(new RegExp(`${scrim} (\\d+)%`, "g"))].map((match) => ({ opacity: Number(match[1]), at: Number(match[2]) }));
    const bodyWidth = Number(/max-width: (\d+)%/.exec(rulesOf(".trn-scene-body").join(""))?.[1]);
    const edge = stops.find(({ at }) => at >= bodyWidth);

    expect(bodyWidth).toBeGreaterThan(0);
    expect(edge).toBeDefined();
    expect(Math.min(...stops.filter(({ at }) => at <= edge!.at).map(({ opacity }) => worstCase(opacity)))).toBeGreaterThanOrEqual(4.5);
  });

  it("修改與關閉鈕有自己的深色底 右邊的圖再亮也看得到", () => {
    const backdrop = rulesOf(".trn-scene .trn-scene-edit").join("");

    expect(worstCase(Number(new RegExp(scrim).exec(backdrop)?.[1]))).toBeGreaterThanOrEqual(4.5);
  });
});
