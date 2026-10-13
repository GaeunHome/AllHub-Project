import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Relic, StarrailCharacter } from "../../lib/characters";
import { CharacterBrowser } from "./character-browser";
import { CharacterDetail } from "./character-detail";
import { CharacterTile } from "./character-tile";

const IMG = "http://mock/img";
const ICONS = "/icons/starrail";

const relic: Relic = {
  id: 61041,
  pos: 1,
  name: "天才的超距遙感",
  level: 15,
  rarity: 5,
  icon: `${IMG}/relic.png`,
  // 主屬性也給 times：畫面要自己略過主屬性，不能靠資料剛好是 0
  mainStat: { name: "生命值", value: "705", times: 3, icon: `${ICONS}/property/max-hp.png` },
  subStats: [
    { name: "暴擊率", value: "3.2%", times: 1, icon: `${ICONS}/property/critical-chance.png` },
    { name: "暴擊傷害", value: "12.9%", times: 3, icon: `${ICONS}/property/critical-damage.png` },
    { name: "攻擊力", value: "4.3%", times: 2, icon: `${ICONS}/property/attack.png` },
    // 換算是強化 6 次，超過 +15 遺器的 5 次：畫面照資料寫，推定或資料有誤時才看得出來
    { name: "速度", value: "8", times: 7, icon: null },
  ],
};

const seele = (overrides: Partial<StarrailCharacter> = {}): StarrailCharacter => ({
  id: 1102,
  name: "希兒",
  level: 80,
  eidolon: 2,
  rarity: 5,
  element: "quantum",
  elementIcon: `${ICONS}/element/quantum.png`,
  path: 2,
  pathIcon: `${ICONS}/path/hunt.png`,
  icon: `${IMG}/icon.png`,
  image: `${IMG}/image.png`,
  lightCone: null,
  relics: [relic],
  eidolons: [],
  stats: [{ type: 1, name: "生命值", icon: `${ICONS}/property/max-hp.png`, base: "931", add: "+1209", final: "2140" }],
  traces: [],
  ...overrides,
});

const detail = (character = seele()) => renderToStaticMarkup(CharacterDetail({ character, titleId: "title", onClose: () => {} }));
const tile = (character = seele()) => renderToStaticMarkup(CharacterTile({ character, onSelect: () => {} }));
const textOf = (markup: string) => markup.replace(/<[^>]+>/g, "");
/** 遺器卡片裡某一條副詞條的 markup：最內層、裡面沒有其他 li 的那一個 li */
const statRow = (markup: string, name: string) =>
  [...markup.matchAll(/<li[^>]*>(?:(?!<\/?li[\s>]).)*<\/li>/g)].map((m) => m[0]).find((li) => li.includes(`>${name}<`)) ?? "";
/** 主屬性那一行：數值是 705 的那一個 p */
const mainStatRow = (markup: string) => [...markup.matchAll(/<p[^>]*>(?:(?!<\/?p[\s>]).)*<\/p>/g)].map((m) => m[0]).find((p) => p.includes(">705<")) ?? "";
/** 畫面上的「+N」（報讀器改念 sr-only 的「強化 N 次」） */
const upgradeText = (row: string) => row.match(/<span aria-hidden="true"[^>]*>(\+\d+)<\/span>/)?.[1] ?? null;
const classesOf = (markup: string, pattern: RegExp) => markup.match(pattern)?.[1].split(/\s+/) ?? [];

describe("角色詳情：版面", () => {
  it("左右內距跟共用的彈出視窗一樣：手機 16px、寬螢幕 24px（標題列與內容對齊同一條線）", () => {
    const markup = detail();
    const header = classesOf(markup, /<header class="([^"]*)"/);
    const body = classesOf(markup, /<\/header><div class="([^"]*)"/);

    expect(header).toEqual(expect.arrayContaining(["px-4", "sm:px-6"]));
    expect(body).toEqual(expect.arrayContaining(["p-4", "sm:p-6"]));
    expect([...header, ...body].filter((c) => /^px?-5$/.test(c))).toEqual([]);
  });

  it("視窗是滿版的大面板（Dialog 的 size=full），套星空主題與切角；尺寸不再自己另寫一套", () => {
    const markup = renderToStaticMarkup(createElement(CharacterBrowser, { characters: [seele()], fetchedLabel: "今天 14:05" }));

    expect(markup.match(/<dialog[^>]*>/)![0]).toContain('class="dialog dialog-full sr-dialog"');
  });

  it("寬螢幕：立繪在左、標題列與內容在右，整個面板一起捲動（游標在立繪上也捲得動），標題列固定在上方", () => {
    const markup = detail();
    const root = classesOf(markup, /^<div class="([^"]*)"/);

    expect(root).toEqual(expect.arrayContaining(["lg:h-full", "lg:flex-row", "lg:items-start", "lg:overflow-y-auto"]));
    expect(classesOf(markup, /<header class="([^"]*)"/)).toEqual(expect.arrayContaining(["sticky", "top-0"]));
  });

  it("手機上直排：標題列（名字與關閉鈕）在最上面，接著是立繪，再來是內容", () => {
    const markup = detail();

    expect(classesOf(markup, /<header class="([^"]*)"/)).toContain("order-1");
    expect(classesOf(markup, /<div class="([^"]*\bsr-stage\b[^"]*)"/)).toContain("order-2");
    expect(classesOf(markup, /<\/header><div class="([^"]*)"/)).toContain("order-3");
    // 右欄在手機上拆開（contents），標題列才排得到立繪前面
    expect(classesOf(markup, /<div class="([^"]*)"><header/)).toEqual(expect.arrayContaining(["contents", "lg:block"]));
  });

  it("右欄依自己的寬度分欄（容器查詢）：寬的時候面板與光錐、星魂並排，遺器與行跡排成三欄", () => {
    const markup = detail(seele({ traces: [{ kind: "skill", name: "普攻", typeLabel: "普攻", level: 6, activated: true, icon: null }] }));
    const content = classesOf(markup, /<\/header><div class="([^"]*)"/);
    const relics = classesOf(markup, /<ul class="([^"]*)"><li class="sr-panel/);

    expect(content).toContain("@container");
    expect(classesOf(markup, /<\/header><div class="[^"]*"><div class="([^"]*)"/)).toContain("@3xl:grid-cols-2");
    expect(relics).toEqual(expect.arrayContaining(["@lg:grid-cols-2", "@3xl:grid-cols-3"]));
    expect(relics.filter((c) => c.startsWith("sm:"))).toEqual([]);
  });
});

describe("角色詳情：立繪", () => {
  const stageOf = (markup: string) => classesOf(markup, /<div class="([^"]*\bsr-stage\b[^"]*)"/);

  it("寬螢幕依面板高度放大：左邊一整欄、跟面板一樣高（最多一半寬），捲動內容時留在原地；不再限寬 240px", () => {
    const stage = stageOf(detail());

    expect(stage).toEqual(expect.arrayContaining(["lg:sticky", "lg:top-0", "lg:h-[100cqh]", "lg:w-[min(50cqw,100cqh)]"]));
    expect(stage).not.toContain("max-w-60");
  });

  it("手機與平板：撐滿面板寬度的方形（碰到左右兩邊），視窗矮時限高", () => {
    expect(stageOf(detail())).toEqual(expect.arrayContaining(["w-full", "aspect-square", "max-h-[65dvh]"]));
  });

  it("背景的光暈跟著稀有度（五星金、四星紫）", () => {
    expect(detail()).toMatch(/<div class="[^"]*\bsr-stage\b[^"]*" data-rarity="5"/);
    expect(detail(seele({ rarity: 4 }))).toMatch(/<div class="[^"]*\bsr-stage\b[^"]*" data-rarity="4"/);
  });
});

describe("角色詳情：遺器副詞條的強化次數", () => {
  it("強化過的副詞條寫「+N」（times 推定含初始那一次，強化次數 = times − 1）；title 與報讀器寫「強化 N 次」，不再畫三角形", () => {
    const row = statRow(detail(), "暴擊傷害");

    expect(upgradeText(row)).toBe("+2");
    expect(row).toContain('title="強化 2 次"');
    expect(row).toContain('<span class="sr-only">強化 2 次</span>');
    expect(row).not.toContain("sr-upgrade");
  });

  it("只強化 1 次（times 是 2）_寫 +1", () => {
    const row = statRow(detail(), "攻擊力");

    expect(upgradeText(row)).toBe("+1");
    expect(row).toContain('title="強化 1 次"');
  });

  it("沒強化過（times 是 1）_不寫 +N，也沒有「強化」字樣", () => {
    const row = statRow(detail(), "暴擊率");

    expect(row).not.toContain("強化");
    expect(textOf(row)).not.toMatch(/\+\d/);
  });

  it("+N 緊貼在數值左邊，數值跟主屬性一樣靠右對齊；文字不像圖形會撐開欄寬，資料給多少就寫多少（times 7 寫 +6）", () => {
    const row = statRow(detail(), "暴擊傷害");

    expect(row.indexOf(">+2<")).toBeGreaterThan(-1);
    expect(row.indexOf(">+2<")).toBeLessThan(row.indexOf(">12.9%<"));
    expect(upgradeText(statRow(detail(), "速度"))).toBe("+6");
  });

  it("主屬性不顯示強化次數（即使 times 大於 1）", () => {
    const row = mainStatRow(detail());

    expect(row).toContain(">生命值<");
    expect(row).not.toContain("強化");
    expect(textOf(row)).not.toMatch(/\+\d/);
  });
});

describe("角色詳情：遊戲圖示", () => {
  it("面板與遺器詞條的名稱前是內建的屬性圖示（lib 組好的站內路徑）", () => {
    const markup = detail();

    for (const icon of ["max-hp", "critical-chance", "critical-damage", "attack"]) expect(markup).toContain(`src="${ICONS}/property/${icon}.png"`);
  });

  it("屬性與命途用內建的遊戲圖示；旁邊已經寫了名稱，圖示不再讓報讀器念一次", () => {
    const markup = detail();

    expect(markup).toContain(`src="${ICONS}/element/quantum.png"`);
    expect(markup).toContain(`src="${ICONS}/path/hunt.png"`);
    expect(markup).not.toContain('aria-label="量子"');
    expect(textOf(markup)).toContain("量子");
    expect(textOf(markup)).toContain("巡獵");
  });

  it("沒有屬性圖示（認不得的屬性）_退回屬性色圓加中文第一個字", () => {
    const markup = detail(seele({ elementIcon: null }));

    expect(markup).not.toContain("element/quantum.png");
    expect(markup).toContain(">量</span>");
  });

  it("立繪完整放進方形外框（object-contain），不裁切人物", () => {
    expect(detail()).toMatch(/<img[^>]*alt="希兒"[^>]*class="[^"]*object-contain/);
  });
});

describe("角色格", () => {
  it("屬性與命途用遊戲圖示；方形頭像框，不裁切方形的頭像", () => {
    const markup = tile();

    expect(markup).toContain(`src="${ICONS}/element/quantum.png"`);
    expect(markup).toContain(`src="${ICONS}/path/hunt.png"`);
    expect(markup).toContain("aspect-square");
    expect(markup).not.toContain("aspect-[4/5]");
  });

  it("沒有屬性圖示（認不得的屬性）_退回屬性色圓加中文第一個字", () => {
    expect(tile(seele({ elementIcon: null }))).toContain(">量</span>");
  });
});
