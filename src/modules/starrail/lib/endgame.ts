// 終局戰績的欄位依 genshin.py 的 challenge 模型整理 還沒用真實帳號驗證

import { asRecord, boolOf, createMissing, numberOf, text } from "@/core/json";
import { elementIconUrl } from "./game-icons";
import { image } from "./image";
import { interpretWith, type HoyolabResult } from "./responses";

/** 名稱跟活動日曆的終局挑戰一樣 用 calendar.ts 的 challengeLabel */
export const ENDGAME_MODES = ["chaos", "fiction", "shadow"] as const;
export type EndgameMode = (typeof ENDGAME_MODES)[number];

export const ENDGAME_ENDPOINTS: Record<EndgameMode, string> = { chaos: "challenge", fiction: "challenge_story", shadow: "challenge_boss" };

/** current 是本期 previous 是上期 對應 schedule_type 的 1 和 2 */
export type EndgameSchedule = "current" | "previous";

export type TeamMember = { id: number | null; level: number | null; icon: string | null; rarity: number | null; element: string | null; elementIcon: string | null; eidolon: number | null };

/** 虛構敘事 末日幻影與異相仲裁的增益 欄位依 genshin.py 的 ChallengeBuff */
export type ChallengeBuff = { name: string | null; description: string | null; icon: string | null };

/** 末日幻影這一期的首領 上半 下半與星啟模式各一隻 */
export type EndgameBoss = { name: string | null; icon: string | null };

/**
 * slot 是第幾隊 node_1 到 node_3 沒挑戰的那一隊不列出 編號照樣對得上
 * boss 只有末日幻影有 buff 混沌回憶沒有
 */
export type EndgameNode = {
  slot: number;
  avatars: TeamMember[];
  score: number | null;
  bossDefeated: boolean | null;
  buff: ChallengeBuff | null;
  boss: EndgameBoss | null;
};

export type EndgameFloor = {
  /** maze_id 用來對上最深的一層 */
  id: number | null;
  name: string | null;
  stars: number | null;
  /** 混沌回憶用了幾回合 其他兩種沒有 */
  rounds: number | null;
  /** 虛構敘事與末日幻影兩個節點的分數總和 混沌回憶沒有 */
  score: number | null;
  quickClear: boolean | null;
  nodes: EndgameNode[];
};

export type Endgame = {
  mode: EndgameMode;
  /** 這一期有沒有挑戰紀錄 */
  hasData: boolean;
  name: string | null;
  /** 伺服器時間 例如 2026/10/6 04:00 */
  begin: string | null;
  end: string | null;
  /** 總星數 含加碼的星 */
  stars: number | null;
  maxFloor: string | null;
  maxFloorId: number | null;
  battles: number | null;
  floors: EndgameFloor[];
};

export type EndgameResult = { endgame: Endgame; missing: string[] };

export function interpretEndgame(json: unknown, mode: EndgameMode): HoyolabResult<EndgameResult> {
  return interpretWith(json, (data) => parseEndgame(data, mode));
}

/** 回應裡的時間是伺服器時區的年月日時分 直接組成字串不換算時區 */
export function formatPartialTime(value: unknown): string | null {
  const t = asRecord(value);
  const [year, month, day, hour, minute] = ["year", "month", "day", "hour", "minute"].map((key) => numberOf(t?.[key]));
  if (year === null || month === null || day === null || hour === null || minute === null) return null;
  return `${year}/${month}/${day} ${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

/** 記下缺少的欄位 這一期沒有挑戰時換成原樣回傳 */
export type Need = <T>(value: T | null, path: string) => T | null;

/** 上場隊伍的角色 終局戰績與異相仲裁共用 path 是記錄缺少欄位用的路徑 */
export function teamMembers(list: readonly unknown[], need: Need, path: string): TeamMember[] {
  return list.flatMap((value): TeamMember[] => {
    const avatar = asRecord(value);
    if (!avatar) return [];
    const at = (key: string) => `${path}[].${key}`;
    const element = need(text(avatar.element)?.toLowerCase() ?? null, at("element"));
    return [
      {
        id: numberOf(avatar.id),
        level: need(numberOf(avatar.level), at("level")),
        icon: need(image(avatar.icon), at("icon")),
        rarity: need(numberOf(avatar.rarity), at("rarity")),
        element,
        elementIcon: elementIconUrl(element),
        eidolon: numberOf(avatar.rank),
      },
    ];
  });
}

/** 沒有增益時是 null 例如那一隊沒挑戰 異相仲裁也用 */
export function challengeBuff(value: unknown): ChallengeBuff | null {
  const buff = asRecord(value);
  if (!buff) return null;
  return { name: text(buff.name_mi18n), description: text(buff.desc_mi18n), icon: image(buff.icon) };
}

function endgameBoss(value: unknown): EndgameBoss | null {
  const boss = asRecord(value);
  return boss ? { name: text(boss.name_mi18n), icon: image(boss.icon) } : null;
}

/** 使用者選的 最深的一層放大 先對 max_floor_id 再對名稱 都對不到時用第一層 */
export function deepestFloor(endgame: Endgame): EndgameFloor | null {
  const { floors, maxFloorId, maxFloor } = endgame;
  return (
    (maxFloorId === null ? undefined : floors.find((floor) => floor.id === maxFloorId)) ??
    (maxFloor === null ? undefined : floors.find((floor) => floor.name === maxFloor)) ??
    floors[0] ??
    null
  );
}

const withExtra = (stars: number | null, extra: unknown) => (stars === null ? null : stars + (numberOf(extra) ?? 0));

export function parseEndgame(data: unknown, mode: EndgameMode): EndgameResult {
  const root = asRecord(data);
  const empty: Endgame = { mode, hasData: false, name: null, begin: null, end: null, stars: null, maxFloor: null, maxFloorId: null, battles: null, floors: [] };
  if (!root) return { endgame: empty, missing: ["has_data"] };

  const missing = createMissing();
  const declared = boolOf(root.has_data);
  if (declared === null) missing.add("has_data");
  const group = asRecord(Array.isArray(root.groups) ? root.groups[0] : null);
  // 這一期沒有挑戰時很多欄位本來就是空的 不算格式不同
  const need = declared === false ? <T>(value: T | null) => value : missing.need;

  // 第幾隊對上這一期的哪一隻首領 genshin.py 的 APCShadowSeason
  const bosses = mode === "shadow" ? [group?.upper_boss, group?.lower_boss, group?.tierce_boss] : [];
  const node = (value: unknown, index: number): EndgameNode[] => {
    const n = asRecord(value);
    if (!n) return [];
    const at = (key: string) => `all_floor_detail[].node[].${key}`;
    return [
      {
        slot: index + 1,
        buff: mode === "chaos" ? null : challengeBuff(n.buff),
        boss: endgameBoss(bosses[index]),
        avatars: teamMembers(Array.isArray(n.avatars) ? n.avatars : (missing.add(at("avatars")), []), need, at("avatars")),
        score: mode === "chaos" ? null : need(numberOf(n.score), at("score")),
        bossDefeated: mode === "shadow" ? need(boolOf(n.boss_defeated), at("boss_defeated")) : null,
      },
    ];
  };

  const floors = (declared === false && !Array.isArray(root.all_floor_detail) ? [] : missing.list(root, "all_floor_detail", "all_floor_detail")).flatMap(
    (value): EndgameFloor[] => {
      const floor = asRecord(value);
      if (!floor) return [];
      const at = (key: string) => `all_floor_detail[].${key}`;
      const nodes = [floor.node_1, floor.node_2, floor.node_3].flatMap((value, index) => node(value, index));
      const scores = nodes.flatMap((n) => (n.score === null ? [] : [n.score]));
      return [
        {
          id: numberOf(floor.maze_id),
          name: need(text(floor.name), at("name")),
          stars: withExtra(need(numberOf(floor.star_num), at("star_num")), floor.extra_star_num),
          rounds: mode === "chaos" ? need(numberOf(floor.round_num), at("round_num")) : null,
          score: mode === "chaos" || scores.length === 0 ? null : scores.reduce((sum, s) => sum + s, 0),
          quickClear: boolOf(floor.is_fast),
          nodes,
        },
      ];
    },
  );

  return {
    endgame: {
      mode,
      hasData: declared ?? floors.length > 0,
      name: need(text(group?.name_mi18n), "groups[].name_mi18n"),
      begin: need(formatPartialTime(root.begin_time) ?? formatPartialTime(group?.begin_time), "begin_time"),
      end: need(formatPartialTime(root.end_time) ?? formatPartialTime(group?.end_time), "end_time"),
      stars: withExtra(need(numberOf(root.star_num), "star_num"), root.extra_star_num),
      maxFloor: need(text(root.max_floor), "max_floor"),
      maxFloorId: numberOf(root.max_floor_id),
      battles: need(numberOf(root.battle_num), "battle_num"),
      floors,
    },
    missing: missing.sorted(),
  };
}
