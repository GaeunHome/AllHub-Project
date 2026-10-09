import { describe, expect, it } from "vitest";
import { ENDGAME_MODES, endgameLabel, formatPartialTime, interpretEndgame, parseEndgame } from "./endgame";

const IMG = "https://act-webstatic.hoyoverse.com/darkmatter/hkrpg";
const time = (day: number, hour = 4) => ({ year: 2026, month: 10, day, hour, minute: 0 });
const avatar = (id: number, rarity = 5, element = "Quantum") => ({ id, level: 80, icon: `${IMG}/avatar/${id}.png`, rarity, element, rank: 1 });

/** 混沌回憶（challenge），依 genshin.py 的 StarRailChallenge */
const chaos = () => ({
  schedule_id: 1012,
  begin_time: time(6),
  end_time: time(20, 3),
  star_num: 33,
  extra_star_num: 3,
  max_floor: "混沌回憶 12",
  max_floor_id: 12,
  battle_num: 14,
  has_data: true,
  all_floor_detail: [
    {
      name: "混沌回憶 12",
      round_num: 7,
      star_num: 3,
      extra_star_num: 1,
      maze_id: 1012012,
      is_chaos: true,
      is_fast: false,
      node_1: { challenge_time: time(7, 21), avatars: [avatar(1102), avatar(1006, 5, "Quantum"), avatar(1001, 4, "Ice"), avatar(1105, 4, "Physical")] },
      node_2: { challenge_time: time(7, 21), avatars: [avatar(1213, 5, "Imaginary")] },
    },
    { name: "混沌回憶 11", round_num: 3, star_num: 3, maze_id: 1012011, is_chaos: true, is_fast: true, node_1: null, node_2: null },
  ],
  groups: [{ schedule_id: 1012, name_mi18n: "星海中的回聲", status: "Running", begin_time: time(6), end_time: time(20, 3) }],
});

/** 虛構敘事（challenge_story）：每個節點有分數 */
const fiction = () => ({
  star_num: 12,
  max_floor: "虛構敘事 4",
  battle_num: 6,
  has_data: true,
  all_floor_detail: [
    {
      name: "虛構敘事 4",
      star_num: 3,
      maze_id: 2004,
      is_fast: false,
      round_num: 0,
      node_1: { challenge_time: time(8), avatars: [avatar(1005, 5, "Lightning")], score: 20000, buff: { id: 1, name_mi18n: "增益", desc_mi18n: "說明", icon: "" } },
      node_2: { challenge_time: time(8), avatars: [avatar(1101, 5, "Wind")], score: 20000 },
    },
  ],
  groups: [{ schedule_id: 2004, name_mi18n: "飛光競逐", status: "Running", begin_time: time(1), end_time: time(29, 3) }],
});

/** 末日幻影（challenge_boss）：節點有分數與是否擊敗首領 */
const shadow = () => ({
  star_num: 9,
  max_floor: "末日幻影 4",
  battle_num: 4,
  has_data: true,
  all_floor_detail: [
    {
      name: "末日幻影 4",
      star_num: 3,
      maze_id: 3004,
      is_fast: false,
      last_update_time: time(9),
      node_1: { challenge_time: null, avatars: [avatar(1402, 5, "Lightning")], score: 2100, boss_defeated: true },
      node_2: { challenge_time: null, avatars: [avatar(1009, 4, "Fire")], score: 1950, boss_defeated: true },
    },
  ],
  groups: [{ schedule_id: 3004, name_mi18n: "毀滅之境", status: "Running", begin_time: time(13), end_time: time(27, 3), upper_boss: { id: 1, name_mi18n: "首領", icon: "" } }],
});

describe("parseEndgame：混沌回憶", () => {
  it("期數名稱、時間、總星數（含加碼的星）、最高關卡、挑戰次數", () => {
    const { endgame, missing } = parseEndgame(chaos(), "chaos");

    expect(missing).toEqual([]);
    expect(endgame).toMatchObject({
      mode: "chaos",
      hasData: true,
      name: "星海中的回聲",
      begin: "2026/10/6 04:00",
      end: "2026/10/20 03:00",
      stars: 36,
      maxFloor: "混沌回憶 12",
      battles: 14,
    });
  });

  it("每一關：名稱、星數、回合數、上場隊伍（等級、星魂、稀有度、屬性轉小寫）", () => {
    const [top, second] = parseEndgame(chaos(), "chaos").endgame.floors;

    expect(top).toMatchObject({ name: "混沌回憶 12", stars: 4, rounds: 7, score: null, quickClear: false });
    expect(top.nodes).toHaveLength(2);
    expect(top.nodes[0].avatars[0]).toEqual({ id: 1102, level: 80, icon: `${IMG}/avatar/1102.png`, rarity: 5, element: "quantum", eidolon: 1 });
    expect(top.nodes[0].avatars.map((a) => a.element)).toEqual(["quantum", "quantum", "ice", "physical"]);
    expect(second).toMatchObject({ name: "混沌回憶 11", stars: 3, rounds: 3, quickClear: true, nodes: [] });
  });
});

describe("parseEndgame：虛構敘事與末日幻影", () => {
  it("虛構敘事_每關分數是兩個節點的總和；沒有頂層時間時用 groups 的", () => {
    const { endgame, missing } = parseEndgame(fiction(), "fiction");

    expect(missing).toEqual([]);
    expect(endgame).toMatchObject({ name: "飛光競逐", begin: "2026/10/1 04:00", end: "2026/10/29 03:00", stars: 12 });
    expect(endgame.floors[0]).toMatchObject({ stars: 3, score: 40000, rounds: null });
    expect(endgame.floors[0].nodes.map((n) => n.score)).toEqual([20000, 20000]);
  });

  it("末日幻影_節點有是否擊敗首領", () => {
    const { endgame, missing } = parseEndgame(shadow(), "shadow");

    expect(missing).toEqual([]);
    expect(endgame.floors[0]).toMatchObject({ score: 4050, rounds: null });
    expect(endgame.floors[0].nodes.map((n) => n.bossDefeated)).toEqual([true, true]);
  });
});

describe("parseEndgame：沒有紀錄或格式不同", () => {
  it("這一期沒有挑戰（has_data false）_hasData false、沒有關卡，不算缺欄位", () => {
    const data = { ...chaos(), has_data: false, star_num: 0, extra_star_num: 0, max_floor: "", battle_num: 0, all_floor_detail: [] };

    const { endgame, missing } = parseEndgame(data, "chaos");
    expect(endgame).toMatchObject({ hasData: false, stars: 0, floors: [] });
    expect(missing).toEqual([]);
  });

  it("讀不到的欄位給 null_missing 記下路徑（不帶值）", () => {
    const data = chaos() as Record<string, unknown>;
    delete data.star_num;
    data.all_floor_detail = [{ name: "混沌回憶 12", node_1: { avatars: [{ id: 1102, element: 3 }] } }];

    const { endgame, missing } = parseEndgame(data, "chaos");

    expect(endgame.stars).toBeNull();
    expect(endgame.floors[0].nodes[0].avatars[0]).toEqual({ id: 1102, level: null, icon: null, rarity: null, element: null, eidolon: null });
    expect(missing).toEqual([
      "all_floor_detail[].node[].avatars[].element",
      "all_floor_detail[].node[].avatars[].icon",
      "all_floor_detail[].node[].avatars[].level",
      "all_floor_detail[].node[].avatars[].rarity",
      "all_floor_detail[].round_num",
      "all_floor_detail[].star_num",
      "star_num",
    ]);
  });

  it("data 不是物件_hasData false、所有欄位 null", () => {
    expect(parseEndgame(null, "fiction")).toMatchObject({ endgame: { mode: "fiction", hasData: false, name: null, floors: [] }, missing: ["has_data"] });
  });
});

describe("interpretEndgame", () => {
  it("成功_回傳整理好的戰績", () => {
    const result = interpretEndgame({ retcode: 0, message: "OK", data: shadow() }, "shadow");

    expect(result.ok && result.data.endgame.name).toBe("毀滅之境");
  });

  it("資料不公開_中文提示到戰績設定打開", () => {
    const result = interpretEndgame({ retcode: 10102, message: "Data is not public" }, "chaos");

    expect(!result.ok && result.message).toContain("HoYoLAB → 戰績 → 設定");
  });
});

describe("顯示用", () => {
  it("三種模式的中文名稱", () => {
    expect(ENDGAME_MODES.map(endgameLabel)).toEqual(["混沌回憶", "虛構敘事", "末日幻影"]);
  });

  it("formatPartialTime：年月日時分組成字串；缺欄位 null", () => {
    expect(formatPartialTime({ year: 2026, month: 1, day: 5, hour: 9, minute: 2 })).toBe("2026/1/5 09:02");
    expect(formatPartialTime({ year: 2026, month: 1 })).toBeNull();
    expect(formatPartialTime(null)).toBeNull();
  });
});
