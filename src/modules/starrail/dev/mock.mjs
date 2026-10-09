// 假的 HoYoLAB API 與圖片 CDN；特殊輸入見 docs/development.md「假伺服器的特殊輸入」：
// ltoken_v2=expired 是 cookie 失效、ltoken_v2=private 時角色詳情沒有公開（10102）、ltuid_v2 以 2 開頭時台港澳服與亞服各有一個角色；兌換碼見 redeem()
const signedUids = new Set();
/** 每個 UID 兌換過的兌換碼與上次兌換的時間（模擬「已兌換」與 5 秒冷卻） */
const redeemed = new Map();
const lastRedeemAt = new Map();
const SMALL_UID = "800000002";
/** 主要角色的 UID 跟著 ltuid_v2 變：不同的人連結到不同的遊戲帳號；同一個 ltuid_v2 拿到同一個 UID（測「已經被其他使用者連結」） */
const mainUidOf = (cookie) => {
  const ltuid = /ltuid_v2=(\d+)/.exec(cookie)?.[1];
  return ltuid ? `9${ltuid.padStart(8, "0").slice(-8)}` : "900000001";
};

const ok = (data) => ({ retcode: 0, message: "OK", data });
const expired = { retcode: -100, message: "Please login", data: null };
const notPublic = { retcode: 10102, message: "Data is not public for the user", data: null };

const IMG = "https://act-webstatic.hoyoverse.com/darkmatter/hkrpg/mock";

// 角色欄位依 genshin.py 的 StarRailDetailCharacter；名字是繁體中文版的譯名
// 每個角色的光錐與遺器都不同，佔位圖的字跟著變，截圖看得出有沒有對應正確
const CHARACTERS = [
  { id: 1102, name: "希兒", element: "quantum", base_type: 2, rarity: 5, level: 80, rank: 2, cone: [23001, "於夜色中", 5], sets: ["繁星璀璨的天才", "繁星競技場"] },
  { id: 1213, name: "丹恆・飲月", element: "imaginary", base_type: 1, rarity: 5, level: 80, rank: 0, cone: [23015, "比陽光更明亮的", 5], sets: ["荒漠的廢土客", "奔狼的都藍王朝"] },
  { id: 1005, name: "卡芙卡", element: "lightning", base_type: 5, rarity: 5, level: 80, rank: 1, cone: [23006, "只需等待", 5], sets: ["激奏雷電的樂隊", "停轉的薩爾索圖"] },
  { id: 1101, name: "布洛妮婭", element: "wind", base_type: 4, rarity: 5, level: 70, rank: 0, cone: [23003, "但戰鬥還未結束", 5], sets: ["晨昏交界的翔鷹", "不老者的仙舟"] },
  { id: 1402, name: "阿格萊雅", element: "lightning", base_type: 8, rarity: 5, level: 80, rank: 0, cone: [23036, "將光陰織成黃金", 5], sets: ["英豪的詩篇", "格拉默的鐵騎"] },
  { id: 1001, name: "三月七", element: "ice", base_type: 6, rarity: 4, level: 80, rank: 6, cone: [21000, "我們是地火", 4], sets: ["戍衛風雪的鐵衛", "筑城者的貝洛伯格"] },
  { id: 1002, name: "丹恆", element: "wind", base_type: 2, rarity: 4, level: 60, rank: 3, cone: [21010, "論劍", 4], sets: ["晨昏交界的翔鷹", "太空封印站"] },
  { id: 1105, name: "娜塔莎", element: "physical", base_type: 7, rarity: 4, level: 50, rank: 5, cone: null, sets: ["雲無留跡的過客", "生命的翁瓦克"] },
  { id: 1009, name: "艾絲妲", element: "fire", base_type: 4, rarity: 4, level: 70, rank: 4, cone: [21005, "記憶中的模樣", 4], sets: ["熔岩鍛鑄的火匠", "盜賊公國塔利亞"] },
];
const NAME_OF = new Map(CHARACTERS.map((c) => [String(c.id), c.name]));
const CONE_OF = new Map(CHARACTERS.filter((c) => c.cone).map((c) => [String(c.cone[0]), c.cone[1]]));
/** 亞服的小號：只有兩個低等級角色 */
const SMALL_ROSTER = [
  { ...CHARACTERS[5], level: 12, rank: 0 },
  { ...CHARACTERS[6], level: 8, rank: 0 },
];

const PROPERTY_NAMES = {
  1: "生命值", 2: "攻擊力", 3: "防禦力", 4: "速度", 5: "暴擊率", 6: "暴擊傷害", 9: "能量恢復效率", 10: "效果命中",
  27: "生命值", 29: "攻擊力", 31: "防禦力", 32: "生命值", 33: "攻擊力", 51: "速度", 52: "暴擊率", 53: "暴擊傷害", 58: "擊破特攻", 61: "屬性傷害加成",
};
const property_info = Object.fromEntries(
  Object.entries(PROPERTY_NAMES).map(([type, name]) => [type, { property_type: Number(type), name, icon: `${IMG}/property/${type}.png`, property_name_relic: name, property_name_filter: name }]),
);

const RELIC_SLOTS = [
  { pos: 1, part: "頭部", main: [27, "705"] },
  { pos: 2, part: "手部", main: [29, "352"] },
  { pos: 3, part: "軀幹", main: [53, "64.8%"] },
  { pos: 4, part: "腳部", main: [51, "25"] },
  { pos: 5, part: "位面球", main: [61, "38.8%"] },
  { pos: 6, part: "連結繩", main: [33, "43.2%"] },
];
const EIDOLON_NAMES = ["初始的輝光", "第二道星芒", "第三種可能", "第四次相遇", "第五個約定", "第六重天穹"];

function detail({ id, name, element, base_type, rarity, level, rank, cone, sets }) {
  const relic = ({ pos, part, main }, i) => ({
    id: id * 10 + pos,
    pos,
    rarity: 5,
    level: pos === 4 && level < 80 ? 12 : 15,
    name: `${sets[pos <= 4 ? 0 : 1]}的${part}`,
    desc: "",
    icon: `${IMG}/relic/${id}-${pos}.png`,
    main_property: { property_type: main[0], value: main[1], times: 0 },
    properties: [
      { property_type: 52, value: `${(2.6 + i * 0.6).toFixed(1)}%`, times: 1 + (i % 3) },
      { property_type: 53, value: `${(5.2 + i * 1.3).toFixed(1)}%`, times: 1 + ((i + 1) % 4) },
      { property_type: 51, value: String(2 + (i % 3)), times: 1 },
      { property_type: 33, value: `${(3.9 + i).toFixed(1)}%`, times: 1 + (i % 2) },
    ],
  });
  const relics = RELIC_SLOTS.map(relic);
  return {
    id,
    name,
    element,
    rarity,
    level,
    rank,
    icon: `${IMG}/avatar/${id}.png`,
    image: `${IMG}/figure/${id}.png`,
    base_type,
    figure_path: `${IMG}/figure/${id}.png`,
    element_id: 0,
    equip: cone ? { id: cone[0], level, rank: 1 + (id % 5), name: cone[1], desc: "", icon: `${IMG}/equip/${cone[0]}.png`, rarity: cone[2] } : null,
    relics: relics.slice(0, 4),
    ornaments: relics.slice(4),
    ranks: EIDOLON_NAMES.map((rankName, i) => ({ id: id * 100 + i + 1, pos: i + 1, name: rankName, icon: `${IMG}/rank/${i + 1}.png`, desc: "", is_unlocked: i < rank })),
    properties: [
      { property_type: 1, base: "1047", add: "+1209", final: "2256" },
      { property_type: 2, base: "640", add: "+1530", final: "2170" },
      { property_type: 3, base: "363", add: "+299", final: "662" },
      { property_type: 4, base: "115", add: "+25", final: "140" },
      { property_type: 5, base: "5.0%", add: "+62.4%", final: "67.4%" },
      { property_type: 6, base: "50.0%", add: "+98.6%", final: "148.6%" },
      { property_type: 9, base: "100.0%", add: "+0.0%", final: "100.0%" },
    ],
    skills: [
      ["普攻", 6, true],
      ["戰技", 10, true],
      ["終結技", 10, true],
      ["天賦", 10, true],
    ]
      .map(([remake, skillLevel, activated], i) => ({
        point_id: `${id}00${i}`,
        point_type: 2,
        item_url: `${IMG}/skill/${i}.png`,
        level: skillLevel,
        is_activated: activated,
        is_rank_work: false,
        pre_point: "0",
        anchor: `Point0${i + 1}`,
        remake,
        skill_stages: [{ name: `${name}的${remake}`, desc: "", level: skillLevel, remake, item_url: `${IMG}/skill/${i}.png`, is_activated: activated, is_rank_work: false }],
      }))
      .concat(
        ["額外能力・壹", "額外能力・貳", "額外能力・參"].map((trace, i) => ({
          point_id: `${id}10${i}`,
          point_type: 3,
          item_url: `${IMG}/skill/major${i}.png`,
          level: 1,
          is_activated: level >= 60 + i * 10,
          is_rank_work: false,
          pre_point: "0",
          anchor: `Point0${i + 6}`,
          remake: "",
          skill_stages: [{ name: trace, desc: "", level: 1, remake: "", item_url: `${IMG}/skill/major${i}.png`, is_activated: level >= 60 + i * 10, is_rank_work: false }],
        })),
        Array.from({ length: 10 }, (_, i) => ({
          point_id: `${id}20${i}`,
          point_type: 1,
          item_url: `${IMG}/skill/bonus.png`,
          level: 1,
          is_activated: i < Math.floor(level / 8),
          is_rank_work: false,
          pre_point: "0",
          anchor: `Point${i + 9}`,
          remake: "",
          skill_stages: [{ name: "屬性加成", desc: "", level: 1, remake: "", item_url: `${IMG}/skill/bonus.png`, is_activated: i < Math.floor(level / 8), is_rank_work: false }],
        })),
      ),
    servant_detail: { servant_id: "0", servant_name: "", servant_icon: "", servant_properties: [], servant_skills: [] },
  };
}

/** 開拓月曆：data_month 是查詢的月份，optional_month 給最近三個月；數字依月份變化，看得出切換月份 */
function ledger(month) {
  const m = Number(month) || 202610;
  const prev = (n) => (n % 100 === 1 ? n - 89 : n - 1);
  const seed = m % 100;
  const sources = [
    ["daily_reward", "每日獎勵", 1800],
    ["event_reward", "活動獎勵", 1500 + seed * 40],
    ["space_reward", "模擬宇宙", 900],
    ["abyss_reward", "混沌回憶與末日幻影", 1200],
    ["mission_reward", "冒險任務", 400 + seed * 10],
    ["mail_reward", "郵件獎勵", 600],
    ["other", "其他", 250],
  ];
  const total = sources.reduce((sum, [, , num]) => sum + num, 0);
  return {
    uid: 900000001,
    region: "prod_official_cht",
    nickname: "開拓者",
    data_month: m,
    optional_month: [prev(prev(m)), prev(m), m],
    month_data: {
      current_hcoin: total,
      current_rails_pass: 8 + (seed % 5),
      last_hcoin: total + 900,
      last_rails_pass: 10,
      hcoin_rate: Math.round((total / (total + 900) - 1) * 100),
      rails_rate: Math.round(((8 + (seed % 5)) / 10 - 1) * 100),
      group_by: sources.map(([action, action_name, num]) => ({ action, action_name, num, percent: Math.round((num / total) * 100) })),
    },
    day_data: { current_hcoin: 120, current_rails_pass: 0, last_hcoin: 60, last_rails_pass: 1 },
  };
}

const partial = (date) => ({ year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate(), hour: 4, minute: 0 });
const ENDGAME_NAMES = { challenge: ["星海中的回聲", "長夜的守望"], challenge_story: ["飛光競逐", "夢境迷宮的寓言"], challenge_boss: ["毀滅之境", "天外的審判"] };
const TEAMS = [
  [1102, 1005, 1001, 1105],
  [1213, 1101, 1009, 1002],
  [1402, 1005, 1101, 1001],
];

/** 終局戰績：本期（schedule_type=1）有 3 層紀錄，上期少一層；隊伍用角色清單裡的角色 */
function endgame(kind, scheduleType) {
  const previous = scheduleType === "2";
  const start = new Date(Date.UTC(2026, 9, previous ? 6 - 42 : 6));
  const end = new Date(start.getTime() + 41 * 86_400_000);
  const member = (id) => {
    const c = CHARACTERS.find((x) => x.id === id);
    return { id, level: c.level, icon: `${IMG}/avatar/${id}.png`, rarity: c.rarity, element: c.element[0].toUpperCase() + c.element.slice(1), rank: c.rank };
  };
  const floorCount = previous ? 2 : 3;
  const floors = Array.from({ length: floorCount }, (_, i) => {
    const level = kind === "challenge" ? 12 - i : 4 - i;
    const stars = i === 0 && !previous ? 2 : 3;
    const name = `${kind === "challenge" ? "混沌回憶" : kind === "challenge_story" ? "虛構敘事" : "末日幻影"} ${level}`;
    const node = (team, n) => ({
      challenge_time: kind === "challenge_boss" ? null : partial(new Date(start.getTime() + (i + 2) * 86_400_000)),
      avatars: TEAMS[(team + i) % TEAMS.length].map(member),
      ...(kind === "challenge" ? {} : { score: kind === "challenge_story" ? 18000 + n * 1500 - i * 2000 : 2400 - n * 150 - i * 300 }),
      ...(kind === "challenge_boss" ? { boss_defeated: stars === 3 || n === 0 } : {}),
    });
    return {
      name,
      star_num: stars,
      maze_id: 1000 + level,
      is_fast: i > 0,
      ...(kind === "challenge" ? { round_num: 5 + i * 2, is_chaos: true } : { round_num: 0 }),
      ...(kind === "challenge_boss" ? { last_update_time: partial(end) } : {}),
      node_1: node(0, 0),
      node_2: node(1, 1),
    };
  });
  const starNum = floors.reduce((sum, f) => sum + f.star_num, 0) + (kind === "challenge" ? (previous ? 27 : 24) : previous ? 6 : 3);
  const group = {
    schedule_id: previous ? 1011 : 1012,
    name_mi18n: ENDGAME_NAMES[kind][previous ? 1 : 0],
    status: previous ? "Finished" : "Running",
    begin_time: partial(start),
    end_time: partial(end),
    ...(kind === "challenge_boss" ? { upper_boss: { id: 1, name_mi18n: "上半首領", icon: `${IMG}/boss/1.png` }, lower_boss: { id: 2, name_mi18n: "下半首領", icon: `${IMG}/boss/2.png` } } : {}),
  };
  return {
    ...(kind === "challenge" ? { schedule_id: group.schedule_id, begin_time: group.begin_time, end_time: group.end_time } : {}),
    star_num: starNum,
    extra_star_num: 0,
    max_floor: floors[0].name,
    max_floor_id: floors[0].maze_id,
    battle_num: floorCount * 2 + 3,
    has_data: true,
    all_floor_detail: floors,
    groups: [group],
  };
}

/** 兌換碼：GIFT 開頭或 STARRAILGIFT 成功（同一個 UID 第二次是已兌換）、USED 開頭已兌換、EXPIRED 開頭過期、LEVEL 開頭等級不足，其他無效；同一個 UID 5 秒內再兌換是太頻繁 */
function redeem({ cdkey = "", uid = "" }, isExpired) {
  if (isExpired) return { retcode: -1071, message: "Please log in", data: null };
  const now = Date.now();
  if (now - (lastRedeemAt.get(uid) ?? 0) < 5000) return { retcode: -2016, message: "Redemption in cooldown", data: null };
  lastRedeemAt.set(uid, now);
  const used = redeemed.get(uid) ?? new Set();
  if (cdkey.startsWith("USED") || used.has(cdkey)) return { retcode: -2017, message: "Redemption code has been used", data: null };
  if (cdkey.startsWith("EXPIRED")) return { retcode: -2001, message: "Redemption code has expired", data: null };
  if (cdkey.startsWith("LEVEL")) return { retcode: -2021, message: "Trailblaze Level too low", data: null };
  if (cdkey === "STARRAILGIFT" || cdkey.startsWith("GIFT")) {
    used.add(cdkey);
    redeemed.set(uid, used);
    return { retcode: 0, message: "OK", data: { msg: "兌換成功" } };
  }
  return { retcode: -2003, message: "Invalid redemption code", data: null };
}

export function handle({ req, url, body, json, image }) {
  const cookie = req.headers.cookie ?? "";
  const isExpired = cookie.includes("ltoken_v2=expired");
  if (url.pathname === "/account/binding/api/getUserGameRolesByCookie") {
    if (isExpired) return json(200, expired);
    const main = { game_biz: "hkrpg_global", region: "prod_official_cht", game_uid: mainUidOf(cookie), nickname: "開拓者", level: 70, region_name: "TW, HK, MO" };
    const small = { game_biz: "hkrpg_global", region: "prod_official_asia", game_uid: SMALL_UID, nickname: "小號", level: 4, region_name: "Asia" };
    return json(200, ok({ list: /ltuid_v2=2/.test(cookie) ? [main, small] : [main] }));
  }
  if (url.pathname === "/game_record/hkrpg/api/note") {
    if (isExpired) return json(200, expired);
    const expedition = (name, ids, remaining) => ({ avatars: ids.map((id) => `${IMG}/avatar/${id}.png`), status: remaining > 0 ? "Ongoing" : "Finished", remaining_time: remaining, name, item_url: `${IMG}/item/${name.length}.png` });
    if (url.searchParams.get("role_id") === SMALL_UID) {
      return json(200, ok({ current_stamina: 60, max_stamina: 240, stamina_recover_time: 64_800, current_reserve_stamina: 0, accepted_epedition_num: 1, total_expedition_num: 4, expeditions: [expedition("看不見的手", [1001, 1002], 3_600)], current_train_score: 100, max_train_score: 500, current_rogue_score: 0, max_rogue_score: 14000, weekly_cocoon_cnt: 3, weekly_cocoon_limit: 3 }));
    }
    return json(
      200,
      ok({
        current_stamina: 231, max_stamina: 300, stamina_recover_time: 22080, current_reserve_stamina: 1200, accepted_epedition_num: 4, total_expedition_num: 4,
        expeditions: [expedition("看不見的手", [1001, 1002], 15_120), expedition("陽光下的迷宮", [1105, 1009], 0), expedition("蘇樂達熱砂海選會場", [1101, 1005], 2_700), expedition("經驗教材", [1213, 1102], 41_400)],
        current_train_score: 300, max_train_score: 500, current_rogue_score: 8000, max_rogue_score: 14000, weekly_cocoon_cnt: 2, weekly_cocoon_limit: 3,
      }),
    );
  }
  if (url.pathname === "/game_record/hkrpg/api/avatar/info") {
    if (isExpired) return json(200, expired);
    if (cookie.includes("ltoken_v2=private")) return json(200, notPublic);
    const roster = url.searchParams.get("role_id") === SMALL_UID ? SMALL_ROSTER : CHARACTERS;
    return json(200, ok({ avatar_list: roster.map(detail), equip_wiki: {}, relic_wiki: {}, property_info, recommend_property: {}, relic_properties: [] }));
  }
  if (url.pathname === "/event/srledger/month_info") {
    if (isExpired) return json(200, expired);
    return json(200, ok(ledger(url.searchParams.get("month"))));
  }
  const endgameKind = /^\/game_record\/hkrpg\/api\/(challenge|challenge_story|challenge_boss)$/.exec(url.pathname)?.[1];
  if (endgameKind) {
    if (isExpired) return json(200, expired);
    if (url.searchParams.get("role_id") === SMALL_UID) return json(200, ok({ has_data: false, star_num: 0, max_floor: "", battle_num: 0, all_floor_detail: [], groups: [] }));
    return json(200, ok(endgame(endgameKind, url.searchParams.get("schedule_type") ?? "1")));
  }
  if (url.pathname === "/common/apicdkey/api/webExchangeCdkeyRisk" && req.method === "POST") return json(200, redeem(JSON.parse(body || "{}"), isExpired));
  if (url.pathname === "/event/luna/os/info") {
    const uid = /ltuid_v2=(\d+)/.exec(cookie)?.[1] ?? "?";
    return json(200, ok({ total_sign_day: signedUids.has(uid) ? 8 : 7, is_sign: signedUids.has(uid) }));
  }
  if (url.pathname === "/event/luna/os/sign") {
    if (isExpired) return json(200, expired);
    const uid = /ltuid_v2=(\d+)/.exec(cookie)?.[1] ?? "?";
    if (signedUids.has(uid)) return json(200, { retcode: -5003, message: "Traveler, you've already checked in today~", data: null });
    signedUids.add(uid);
    return json(200, ok({ code: "ok", gt_result: { risk_code: 0, gt: "", challenge: "", success: 0, is_risk: false } }));
  }

  // ---------- 圖片 CDN（act-webstatic.hoyoverse.com） ----------
  if (url.pathname.startsWith("/darkmatter/hkrpg/mock/")) {
    const [kind, file = ""] = url.pathname.slice("/darkmatter/hkrpg/mock/".length).split("/");
    const key = file.replace(/\.png$/, "");
    if (kind === "avatar") return image(Array.from(NAME_OF.get(key) ?? "?")[0], { width: 128, height: 128 });
    if (kind === "figure") return image(NAME_OF.get(key) ?? "?", { width: 512, height: 512 });
    if (kind === "equip") return image((CONE_OF.get(key) ?? "光錐").slice(0, 4), { width: 128, height: 160 });
    if (kind === "relic") {
      const [characterId, pos] = key.split("-");
      return image(`${Array.from(NAME_OF.get(characterId) ?? "?")[0]}${pos}`, { width: 88, height: 88 });
    }
    if (kind === "rank") return image(`魂${key}`, { width: 88, height: 88, round: true });
    if (kind === "skill") return image(key.startsWith("major") ? "行" : key === "bonus" ? "+" : "技", { width: 64, height: 64, round: true });
    return image(kind, { width: 96, height: 96 });
  }
  return false;
}
