import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { markup, textOf } from "@/dev/test-helpers";
import type { Endgame, EndgameNode, TeamMember } from "../../lib/endgame";
import { EndgameView, type EndgameRecord } from "./endgame-view";

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
const node = (...ids: number[]): EndgameNode => ({ avatars: ids.map((id) => member(id)), score: null, bossDefeated: null });

const chaos: Endgame = {
  mode: "chaos",
  hasData: true,
  name: "星海中的回聲",
  begin: "2026/10/6 04:00",
  end: "2026/11/16 04:00",
  stars: 32,
  maxFloor: "混沌回憶 12",
  battles: 9,
  floors: [{ name: "混沌回憶 12", stars: 3, rounds: 5, score: null, quickClear: false, nodes: [node(1102, 1005), node(1213, 1101), node(1402, 1001)] }],
};

const render = (endgame: Endgame) => {
  const records: EndgameRecord[] = [{ mode: "chaos", schedule: "current", ok: true, endgame }];
  return markup(createElement(EndgameView, { records, names: { 1102: "希兒" } }));
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
    const markup = render({ ...chaos, floors: [{ ...chaos.floors[0], nodes: [{ avatars: [member(1102, { elementIcon: null })], score: null, bossDefeated: null }] }] });

    expect(markup).not.toContain("element/quantum.png");
    expect(markup).toContain(">量</span>");
  });
});
