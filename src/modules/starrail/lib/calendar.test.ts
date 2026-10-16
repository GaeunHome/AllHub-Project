import { describe, expect, it } from "vitest";
import { interpretActCalendar, isOngoing, ongoingCalendar, parseActCalendar, progressFull } from "./calendar";

// 欄位名稱依 genshin.py 的 genshin/models/starrail/chronicle/events.py 的 HSREventCalendar
// 時間是 Unix 秒數的字串 hoyoverse-api 與 hoyodeck 的型別也是字串
const NOW = new Date("2026-10-15T04:00:00Z");
const ts = (iso: string) => String(Date.parse(iso) / 1000);
const time = (start: string, end: string) => ({ start_ts: ts(start), end_ts: ts(end), start_time: "", end_time: "", now: ts(NOW.toISOString()) });

const sample = () => ({
  cur_game_version: "3.7",
  now: ts(NOW.toISOString()),
  challenge_list: [
    {
      group_id: 1012,
      name_mi18n: "永恆的信條",
      challenge_type: "ChallengeTypeChasm",
      status: "challengeStatusInProgress",
      current_progress: 24,
      total_progress: 36,
      show_text: "24/36",
      time_info: time("2026-09-28T20:00:00Z", "2026-10-26T20:00:00Z"),
      reward_list: [],
      special_reward: null,
    },
    {
      group_id: 2007,
      name_mi18n: "飛光競逐",
      challenge_type: "ChallengeTypeStory",
      status: "challengeStatusFinish",
      current_progress: 12,
      total_progress: 12,
      show_text: "12/12",
      time_info: time("2026-09-14T20:00:00Z", "2026-10-16T20:00:00Z"),
      reward_list: [],
      special_reward: null,
    },
  ],
  act_list: [
    {
      id: 30001,
      version: "3.7",
      name: "花藏繁生\\n雙倍獎勵",
      act_type: "ActivityTypeDouble",
      act_status: "DoubleRewardActStatusProgress",
      current_progress: 1,
      total_progress: 3,
      time_info: time("2026-10-10T02:00:00Z", "2026-10-17T20:00:00Z"),
      reward_list: [],
      special_reward: { item_id: 0, name: "", icon: "", wiki_url: "", num: 0, rarity: 0 },
    },
    {
      id: 30002,
      version: "3.7",
      name: "常駐的活動",
      act_type: "ActivityTypeOther",
      act_status: "OtherActStatusUnFinish",
      current_progress: 0,
      total_progress: 0,
      time_info: { start_ts: "0", end_ts: "0", start_time: "", end_time: "", now: "0" },
      reward_list: [],
    },
    {
      id: 30003,
      version: "3.8",
      name: "下個版本的活動",
      act_type: "ActivityTypeOther",
      act_status: "OtherActStatusUnopened",
      current_progress: 0,
      total_progress: 10,
      time_info: time("2026-10-29T02:00:00Z", "2026-11-12T20:00:00Z"),
      reward_list: [],
    },
  ],
  avatar_card_pool_list: [
    {
      id: "4001",
      name: "蝶立鋒鍔",
      type: "CardPoolRole",
      avatar_list: [
        { item_id: "1308", item_name: "黃泉", icon_url: "https://act-webstatic.hoyoverse.com/a/1308.png", rarity: "5", avatar_base_type: "1", damage_type: "4", is_forward: true, wiki_url: "", item_avatar_icon_path: "" },
        { item_id: "1001", item_name: "三月七", icon_url: "//act-webstatic.hoyoverse.com/a/1001.png", rarity: "4", avatar_base_type: "6", damage_type: "2", is_forward: false, wiki_url: "", item_avatar_icon_path: "" },
      ],
      equip_list: [],
      is_after_version: false,
      time_info: time("2026-10-08T02:00:00Z", "2026-10-28T19:59:00Z"),
      version: "3.7",
    },
  ],
  equip_card_pool_list: [
    {
      id: "5001",
      name: "流光定影",
      type: "CardPoolEquipment",
      avatar_list: [],
      equip_list: [{ item_id: "23024", item_name: "行於流逝的岸", item_url: "https://act-webstatic.hoyoverse.com/e/23024.png", rarity: "5", avatar_base_type: "1", is_forward: true, wiki_url: "" }],
      is_after_version: false,
      time_info: time("2026-10-08T02:00:00Z", "2026-10-28T19:59:00Z"),
      version: "3.7",
    },
  ],
});

describe("parseActCalendar：活動日曆（get_act_calender）", () => {
  it("終局挑戰：類型、名稱、狀態、進度與起訖時間（秒數換成毫秒）", () => {
    const { calendar, missing } = parseActCalendar(sample());

    expect(missing).toEqual([]);
    expect(calendar.version).toBe("3.7");
    expect(calendar.challenges).toEqual([
      { id: 1012, kind: "chaos", name: "永恆的信條", status: "ongoing", current: 24, total: 36, startsAt: Date.parse("2026-09-28T20:00:00Z"), endsAt: Date.parse("2026-10-26T20:00:00Z") },
      { id: 2007, kind: "fiction", name: "飛光競逐", status: "finished", current: 12, total: 12, startsAt: Date.parse("2026-09-14T20:00:00Z"), endsAt: Date.parse("2026-10-16T20:00:00Z") },
    ]);
  });

  it.each([
    ["ChallengeTypeChasm", "chaos"],
    ["ChallengeTypeStory", "fiction"],
    ["ChallengeTypeBoss", "shadow"],
    ["ChallengeTypePeak", "peak"],
    ["ChallengeTypeSomethingNew", null],
  ])("challenge_type %s_%s（認不得的照樣列出，只顯示名稱）", (type, kind) => {
    const data = sample();
    data.challenge_list[0].challenge_type = type;

    expect(parseActCalendar(data).calendar.challenges[0].kind).toBe(kind);
  });

  it("活動：雙倍獎勵另外標出來；名稱裡的 \\n 換成空白（genshin.py 也這樣處理）；常駐活動的時間是 0，當作沒有排定", () => {
    const { calendar } = parseActCalendar(sample());

    expect(calendar.events.map((e) => [e.name, e.kind, e.current, e.total])).toEqual([
      ["花藏繁生 雙倍獎勵", "double", 1, 3],
      ["常駐的活動", "other", 0, 0],
      ["下個版本的活動", "other", 0, 10],
    ]);
    expect(calendar.events[1]).toMatchObject({ startsAt: null, endsAt: null });
  });

  it("躍遷：角色池用 avatar_list 的 icon_url、光錐池用 equip_list 的 item_url；協定相對網址補成 https，稀有度是數字", () => {
    const { calendar } = parseActCalendar(sample());

    expect(calendar.warps).toEqual([
      {
        id: "4001",
        kind: "character",
        name: "蝶立鋒鍔",
        startsAt: Date.parse("2026-10-08T02:00:00Z"),
        endsAt: Date.parse("2026-10-28T19:59:00Z"),
        items: [
          { id: "1308", name: "黃泉", icon: "https://act-webstatic.hoyoverse.com/a/1308.png", rarity: 5 },
          { id: "1001", name: "三月七", icon: "https://act-webstatic.hoyoverse.com/a/1001.png", rarity: 4 },
        ],
      },
      {
        id: "5001",
        kind: "lightCone",
        name: "流光定影",
        startsAt: Date.parse("2026-10-08T02:00:00Z"),
        endsAt: Date.parse("2026-10-28T19:59:00Z"),
        items: [{ id: "23024", name: "行於流逝的岸", icon: "https://act-webstatic.hoyoverse.com/e/23024.png", rarity: 5 }],
      },
    ]);
  });

  it("讀不到的欄位給 null_missing 記下欄位路徑（不帶值）", () => {
    const data = sample() as Record<string, unknown>;
    data.challenge_list = [{ group_id: 1, challenge_type: "ChallengeTypeBoss", status: "???", current_progress: "x", time_info: time("2026-10-01T00:00:00Z", "2026-10-20T00:00:00Z") }];
    delete data.equip_card_pool_list;
    delete data.cur_game_version;

    const { calendar, missing } = parseActCalendar(data);

    expect(calendar.challenges[0]).toMatchObject({ kind: "shadow", name: null, status: null, current: null, total: null });
    expect(calendar.version).toBeNull();
    expect(missing).toEqual([
      "challenge_list[].current_progress",
      "challenge_list[].name_mi18n",
      "challenge_list[].status",
      "challenge_list[].total_progress",
      "cur_game_version",
      "equip_card_pool_list",
    ]);
  });

  it("整個 data 不對_清單都是空的，記下每個清單的欄位", () => {
    const { calendar, missing } = parseActCalendar(null);

    expect(calendar).toEqual({ version: null, challenges: [], events: [], warps: [] });
    expect(missing).toEqual(["act_list", "avatar_card_pool_list", "challenge_list", "cur_game_version", "equip_card_pool_list"]);
  });
});

describe("interpretActCalendar：HoYoLAB 的回應", () => {
  it("成功_回傳整理好的日曆；cookie 失效或其他錯誤照共用的說明", () => {
    expect(interpretActCalendar({ retcode: 0, message: "OK", data: sample() })).toMatchObject({ ok: true, data: { calendar: { version: "3.7" } } });
    expect(interpretActCalendar({ retcode: -100, message: "Please login" })).toMatchObject({ ok: false, cookieInvalid: true });
    expect(interpretActCalendar({ retcode: 10102, message: "not public" })).toMatchObject({ ok: false, cookieInvalid: false });
  });
});

describe("正在進行的項目：快結束的排前面", () => {
  it("只留已經開始、還沒結束的；常駐（沒有結束時間）與下個版本的不列；依結束時間排", () => {
    const ongoing = ongoingCalendar(parseActCalendar(sample()).calendar, NOW);

    expect(ongoing.challenges.map((c) => c.name)).toEqual(["飛光競逐", "永恆的信條"]);
    expect(ongoing.events.map((e) => e.name)).toEqual(["花藏繁生 雙倍獎勵"]);
    expect(ongoing.warps.map((w) => w.name)).toEqual(["蝶立鋒鍔", "流光定影"]);
  });

  it("剛好在結束的那一刻_已經結束；開始的那一刻_已經開始", () => {
    const item = { startsAt: NOW.getTime(), endsAt: NOW.getTime() + 1000 };

    expect(isOngoing(item, NOW)).toBe(true);
    expect(isOngoing(item, new Date(NOW.getTime() + 1000))).toBe(false);
  });
});

describe("progressFull：進度拿滿了沒", () => {
  it("24/36 沒滿、36/36 滿了；總數是 0 或讀不到時判斷不了", () => {
    expect(progressFull({ current: 24, total: 36 })).toBe(false);
    expect(progressFull({ current: 36, total: 36 })).toBe(true);
    expect(progressFull({ current: 0, total: 0 })).toBeNull();
    expect(progressFull({ current: null, total: 36 })).toBeNull();
  });
});
