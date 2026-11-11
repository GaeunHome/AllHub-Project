import { describe, expect, it } from "vitest";
import { interpretPeak, parsePeak } from "../peak";

// 回應的形狀照 genshin.py 的 AnomalyArbitration 與 Starward 的 ChallengePeakData 只留用得到的欄位
const time = (month: number, day: number, hour = 4, minute = 0) => ({ year: 2026, month, day, hour, minute });
const avatar = (id: number, rank = 0) => ({ id, level: 80, icon: `https://cdn/avatar/${id}.png`, rarity: 5, element: "Ice", rank });
const mobInfo = (mazeId: number, monster: string) => ({ maze_id: mazeId, name: `騎士關卡 ${mazeId}`, monster_name: monster, monster_icon: `https://cdn/monster/${mazeId}.png` });
const mobRecord = (mazeId: number, stars: number, rounds: number, fast = false) => ({
  maze_id: mazeId,
  has_challenge_record: true,
  challenge_time: time(11, 2),
  avatars: [avatar(1102, 2), avatar(1005)],
  round_num: rounds,
  star_num: stars,
  is_fast: fast,
});

/** 這一期打完了 騎士的紀錄故意跟 mob_infos 的順序不同 */
function record(groupId: number, begin: ReturnType<typeof time>) {
  return {
    group: { group_id: groupId, begin_time: begin, end_time: time(12, 8, 3, 59), status: "challengeStatusInProgress", name_mi18n: "王棋與騎士", game_version: "3.7", theme_pic_path: `https://cdn/theme/${groupId}.png` },
    boss_info: { maze_id: 9001, name_mi18n: "帕姆王", hard_mode_name_mi18n: "絕境", icon: "https://cdn/boss/9001.png" },
    mob_infos: [mobInfo(9011, "銀鬃鐵衛"), mobInfo(9012, "虛卒"), mobInfo(9013, "裂界造物")],
    has_challenge_record: true,
    battle_num: 5,
    boss_record: {
      maze_id: 9001,
      has_challenge_record: true,
      challenge_time: time(11, 3),
      avatars: [avatar(1213, 1), avatar(1101, 6), avatar(1009), avatar(1002)],
      buff: { id: 1, name_mi18n: "王的敕令", desc_mi18n: "首領受到的傷害提高", icon: "https://cdn/buff/1.png" },
      hard_mode: true,
      round_num: 12,
      star_num: 3,
      finish_color_medal: true,
      challenge_peak_rank_icon_type: "ChallengePeakRankIconTypeGold",
      challenge_peak_rank_icon: "https://cdn/medal/gold.png",
      record_unique_key: "k",
    },
    mob_records: [mobRecord(9013, 3, 4, true), mobRecord(9011, 3, 3), mobRecord(9012, 2, 6)],
    boss_stars: 3,
    mob_stars: 8,
  };
}

const response = (records: unknown[]) => ({ challenge_peak_records: records, challenge_peak_best_record_brief: { total_battle_num: 9, mob_stars: 9, boss_stars: 3 }, role: { server: "prod_official_cht", nickname: "開拓者", level: 70, role_id: "900000001" } });

describe("parsePeak（異相仲裁：3 個騎士關加 1 個王棋關）", () => {
  it("HoYoLAB 一次回最近幾期：照開始時間新的在前（本期在第一個）", () => {
    const { seasons } = parsePeak(response([record(4001, time(9, 15)), record(4003, time(10, 27)), record(4002, time(10, 1))])).peak;

    expect(seasons.map((s) => s.begin)).toEqual(["2026/10/27 04:00", "2026/10/1 04:00", "2026/9/15 04:00"]);
  });

  it("每一期：名稱、版本、期間、主題圖、挑戰次數，王棋與騎士各拿了幾顆星", () => {
    const [season] = parsePeak(response([record(4002, time(10, 27))])).peak.seasons;

    expect(season).toMatchObject({
      hasData: true,
      name: "王棋與騎士",
      version: "3.7",
      begin: "2026/10/27 04:00",
      end: "2026/12/8 03:59",
      theme: "https://cdn/theme/4002.png",
      battles: 5,
      bossStars: 3,
      knightStars: 8,
    });
  });

  it("王棋：首領名稱與圖、高難度（名稱）、星數、回合、增益、評級勳章與上場隊伍（含星魂）", () => {
    const { boss } = parsePeak(response([record(4002, time(10, 27))])).peak.seasons[0];

    expect(boss).toMatchObject({
      name: "帕姆王",
      icon: "https://cdn/boss/9001.png",
      cleared: true,
      hardMode: true,
      hardModeName: "絕境",
      stars: 3,
      rounds: 12,
      buff: { name: "王的敕令", description: "首領受到的傷害提高", icon: "https://cdn/buff/1.png" },
      medal: "https://cdn/medal/gold.png",
    });
    expect(boss.avatars.map((a) => [a.id, a.eidolon, a.element])).toEqual([
      [1213, 1, "ice"],
      [1101, 6, "ice"],
      [1009, 0, "ice"],
      [1002, 0, "ice"],
    ]);
  });

  it("騎士照 mob_infos 的順序（騎士一二三），紀錄用 maze_id 對上：怪物名稱與圖、星數、回合、快速通關", () => {
    const { knights } = parsePeak(response([record(4002, time(10, 27))])).peak.seasons[0];

    expect(knights.map((k) => [k.name, k.icon, k.stars, k.rounds, k.quickClear])).toEqual([
      ["銀鬃鐵衛", "https://cdn/monster/9011.png", 3, 3, false],
      ["虛卒", "https://cdn/monster/9012.png", 2, 6, false],
      ["裂界造物", "https://cdn/monster/9013.png", 3, 4, true],
    ]);
    expect(knights.every((k) => k.cleared && k.avatars.length === 2)).toBe(true);
  });

  it("這一期還沒打（沒有挑戰紀錄、沒有 boss_record、騎士沒有紀錄）_hasData 是 false，王棋與騎士照樣列出名稱，不算格式不同", () => {
    const empty = { ...record(4003, time(12, 8)), has_challenge_record: false, battle_num: 0, boss_record: null, mob_records: [], boss_stars: 0, mob_stars: 0 };

    const { peak, missing } = parsePeak(response([empty]));

    expect(peak.seasons[0]).toMatchObject({ hasData: false, boss: { name: "帕姆王", cleared: false, stars: null, avatars: [], medal: null }, bossStars: 0, knightStars: 0 });
    expect(peak.seasons[0].knights.map((k) => [k.name, k.cleared])).toEqual([
      ["銀鬃鐵衛", false],
      ["虛卒", false],
      ["裂界造物", false],
    ]);
    expect(missing).toEqual([]);
  });

  it("沒有任何一期（從來沒打過）_空的清單", () => {
    expect(parsePeak(response([])).peak.seasons).toEqual([]);
  });

  it("欄位改了名字或少了_記下欄位路徑（log 只記路徑），讀得到的照樣顯示", () => {
    const renamed = record(4002, time(10, 27)) as Record<string, unknown>;
    delete renamed.mob_stars;
    const broken = { ...renamed, boss_info: { ...(renamed.boss_info as object), name_mi18n: undefined } };

    const { peak, missing } = parsePeak(response([broken]));

    expect(missing).toEqual(["challenge_peak_records[].boss_info.name_mi18n", "challenge_peak_records[].mob_stars"]);
    expect(peak.seasons[0].bossStars).toBe(3);
  });

  it("challenge_peak_records 不是陣列_記下來，畫面當成沒有紀錄", () => {
    const { peak, missing } = parsePeak({ role: {} });

    expect(peak.seasons).toEqual([]);
    expect(missing).toEqual(["challenge_peak_records"]);
  });

  it("interpretPeak：retcode 不是 0 時照其他戰績一樣回錯誤訊息（資料不公開 10102 提示到 HoYoLAB 設定）", () => {
    const result = interpretPeak({ retcode: 10102, message: "Data is not public for the user", data: null });

    expect(result.ok).toBe(false);
    expect(!result.ok && result.message).toContain("HoYoLAB");
  });
});
