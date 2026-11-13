import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { markup, textOf } from "@/dev/test-helpers";
import type { Endgame, EndgameNode, TeamMember } from "../../../lib/endgame";
import { EndgameRecordView, EndgameView, type EndgameRecord } from "../endgame-view";

const IMG = "http://mock/img";
const member = (id: number, overrides: Partial<TeamMember> = {}): TeamMember => ({
  id,
  level: 80,
  icon: `${IMG}/avatar/${id}.png`,
  rarity: 5,
  element: "quantum",
  elementIcon: "/icons/starrail/element/quantum.png",
  eidolon: 0,
  ...overrides,
});
const node = (slot: number, ...ids: number[]): EndgameNode => ({ slot, avatars: ids.map((id) => member(id)), score: null, bossDefeated: null, buff: null, boss: null });

const chaos: Endgame = {
  mode: "chaos",
  hasData: true,
  name: "星海中的回聲",
  begin: "2026/10/6 04:00",
  end: "2026/11/16 04:00",
  stars: 32,
  maxFloor: "混沌回憶 12",
  maxFloorId: 1012,
  battles: 9,
  floors: [{ id: 1012, name: "混沌回憶 12", stars: 3, rounds: 5, score: null, quickClear: false, nodes: [node(1, 1102, 1005), node(2, 1213, 1101), node(3, 1402, 1001)] }],
};

const render = (endgame: Endgame) => {
  const records: EndgameRecord[] = [{ mode: "chaos", schedule: "current", ok: true, endgame }];
  return markup(createElement(EndgameView, { records, peak: { ok: true, peak: { seasons: [] } }, names: { 1102: "希兒" } }));
};

describe("終局戰績的上場隊伍", () => {
  it("隊伍編號是小方塊裡的數字，報讀器念「第 N 隊」；不再寫上半、下半、隊伍 3", () => {
    const markup = render(chaos);

    for (const n of [1, 2, 3]) expect(markup).toContain(`<span aria-hidden="true">${n}</span><span class="sr-only">第 ${n} 隊</span>`);
    expect(textOf(markup)).not.toMatch(/上半|下半|隊伍 \d/);
  });

  it("角色頭像的屬性用內建的遊戲圖示；旁邊沒有屬性名稱，圖示本身要讓報讀器念出屬性", () => {
    const markup = render(chaos);

    expect(markup).toContain('src="/icons/starrail/element/quantum.png"');
    expect(markup).toContain('role="img" aria-label="量子"');
  });

  it("沒有屬性圖示（認不得的屬性）_退回屬性色圓加中文第一個字", () => {
    const markup = render({ ...chaos, floors: [{ ...chaos.floors[0], nodes: [{ ...node(1), avatars: [member(1102, { elementIcon: null })] }] }] });

    expect(markup).not.toContain("element/quantum.png");
    expect(markup).toContain(">量</span>");
  });
});

describe("終局戰績的模式與角色小卡（使用者選的 B）", () => {
  it("模式多一個異相仲裁，排在另外三種後面", () => {
    const tabs = [...render(chaos).matchAll(/<button[^>]*role="tab"[^>]*>(.*?)<\/button>/g)].map(([, label]) => textOf(label));

    expect(tabs).toEqual(["混沌回憶", "虛構敘事", "末日幻影", "異相仲裁"]);
  });

  it("角色小卡寫出等級與星魂（1 魂以上），看得出是幾魂", () => {
    const html = render({ ...chaos, floors: [{ ...chaos.floors[0], nodes: [{ ...node(1), avatars: [member(1102, { eidolon: 2 }), member(1005, { level: 70 })] }] }] });

    expect(textOf(html, { spaced: true })).toContain("2 魂");
    expect(textOf(html, { spaced: true })).toContain("Lv.70");
  });
});

// 使用者選的 最深的一層照異相仲裁放大 其他層收起來
describe("最深的一層放大，其他層收起來", () => {
  const renderRecord = (endgame: Endgame) => markup(createElement(EndgameRecordView, { endgame, names: { 1102: "希兒" } }));

  it("最深的一層（max_floor_id 對到的）在上面；其他層收在「其他關卡（N）」裡，點了才展開", () => {
    const other = { ...chaos.floors[0], id: 1011, name: "混沌回憶 11", stars: 2 };
    const html = renderRecord({ ...chaos, floors: [other, chaos.floors[0]] });
    const [before, folded] = html.split("<details");

    expect(textOf(before)).toContain("混沌回憶 12");
    expect(textOf(before)).not.toContain("混沌回憶 11");
    expect(textOf(folded, { spaced: true })).toContain("其他關卡（1）");
    expect(textOf(folded)).toContain("混沌回憶 11");
  });

  it("只有一層_沒有「其他關卡」", () => {
    expect(renderRecord(chaos)).not.toContain("<details");
  });

  it("末日幻影_每一隊的卡片寫首領的名字、放首領的圖，增益、分數與有沒有擊敗首領", () => {
    const shadowNode = (slot: number, boss: string, defeated: boolean): EndgameNode => ({
      ...node(slot, 1102),
      score: 2100,
      bossDefeated: defeated,
      boss: { name: boss, icon: `${IMG}/boss/${slot}.png` },
      buff: { name: "戰意", description: "擊破時額外造成傷害", icon: `${IMG}/buff/7.png` },
    });
    const shadow: Endgame = { ...chaos, mode: "shadow", floors: [{ ...chaos.floors[0], rounds: null, score: 4200, nodes: [shadowNode(1, "上半首領", true), shadowNode(2, "下半首領", false)] }] };
    const html = renderRecord(shadow);
    const text = textOf(html, { spaced: true });

    expect(text).toContain("上半首領");
    expect(text).toContain("下半首領");
    expect(html).toContain(`src="${IMG}/boss/1.png"`);
    expect(html).toContain(`src="${IMG}/buff/7.png"`);
    expect(text).toContain("戰意");
    expect(text).toContain("2,100");
    expect(text).toContain("擊敗首領");
    expect(text).toContain("未擊敗");
  });

  it("虛構敘事_每一隊的卡片放增益的圖示與名稱、分數", () => {
    const fictionNode: EndgameNode = { ...node(1, 1102), score: 20000, buff: { name: "光速飛馳", description: "說明", icon: `${IMG}/buff/3.png` } };
    const html = renderRecord({ ...chaos, mode: "fiction", floors: [{ ...chaos.floors[0], rounds: null, score: 20000, nodes: [fictionNode] }] });

    expect(html).toContain(`src="${IMG}/buff/3.png"`);
    expect(textOf(html, { spaced: true })).toContain("光速飛馳");
    expect(textOf(html, { spaced: true })).toContain("20,000");
  });
});
