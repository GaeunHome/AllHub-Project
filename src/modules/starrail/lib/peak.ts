// 異相仲裁的戰績 欄位依 genshin.py 的 AnomalyArbitration 與 Starward 的 ChallengePeak 整理
// 還沒用真實帳號驗證 一期是 3 個騎士關加 1 個王棋關

import { asRecord, boolOf, createMissing, numberOf, text } from "@/core/json";
import { challengeBuff, formatPartialTime, teamMembers, type ChallengeBuff, type Need, type TeamMember } from "./endgame";
import { image } from "./image";
import { interpretWith, type HoyolabResult } from "./responses";

/** 騎士或王棋的一關 cleared 是這一關有沒有挑戰紀錄 */
export type PeakStage = {
  /** 王棋是首領名稱 騎士是怪物名稱 */
  name: string | null;
  icon: string | null;
  cleared: boolean;
  stars: number | null;
  rounds: number | null;
  quickClear: boolean | null;
  avatars: TeamMember[];
};

export type PeakBuff = ChallengeBuff;

export type PeakBoss = PeakStage & {
  hardMode: boolean;
  /** 高難度的名稱 例如絕境 */
  hardModeName: string | null;
  buff: PeakBuff | null;
  /** 這一期王棋的評級勳章圖 */
  medal: string | null;
};

export type PeakSeason = {
  hasData: boolean;
  name: string | null;
  version: string | null;
  /** 伺服器時間 例如 2026/10/27 04:00 */
  begin: string | null;
  end: string | null;
  /** 這一期的主題圖 */
  theme: string | null;
  battles: number | null;
  bossStars: number | null;
  knightStars: number | null;
  boss: PeakBoss;
  knights: PeakStage[];
};

/** 新的在前 第一個是本期 */
export type Peak = { seasons: PeakSeason[] };

export type PeakResult = { peak: Peak; missing: string[] };

export function interpretPeak(json: unknown): HoyolabResult<PeakResult> {
  return interpretWith(json, parsePeak);
}

const RECORD = "challenge_peak_records[]";

/** 伺服器時區的年月日時分 只拿來排先後 */
function timeKey(value: unknown): number {
  const t = asRecord(value);
  const [year, month, day, hour, minute] = ["year", "month", "day", "hour", "minute"].map((key) => numberOf(t?.[key]) ?? 0);
  return (((year * 100 + month) * 100 + day) * 100 + hour) * 100 + minute;
}

function parseBuff(value: unknown, need: Need): PeakBuff | null {
  const buff = challengeBuff(value);
  if (!buff) return null;
  return { ...buff, name: need(buff.name, `${RECORD}.boss_record.buff.name_mi18n`) };
}

function parseSeason(value: unknown, missing: ReturnType<typeof createMissing>): PeakSeason[] {
  const record = asRecord(value);
  if (!record) return [];
  const declared = boolOf(record.has_challenge_record);
  if (declared === null) missing.add(`${RECORD}.has_challenge_record`);
  // 這一期沒有挑戰時紀錄本來就是空的 不算格式不同
  const need: Need = declared === false ? (v) => v : missing.need;
  const at = (key: string) => `${RECORD}.${key}`;
  const group = asRecord(record.group);
  const bossInfo = asRecord(record.boss_info);
  const bossRecord = asRecord(record.boss_record);
  const bossCleared = boolOf(bossRecord?.has_challenge_record) ?? false;
  const recordNeed: Need = bossCleared ? need : (v) => v;
  const mobRecords = (Array.isArray(record.mob_records) ? record.mob_records : []).flatMap((item) => {
    const mob = asRecord(item);
    return mob ? [mob] : [];
  });

  const knights = (Array.isArray(record.mob_infos) ? record.mob_infos : (missing.add(at("mob_infos")), [])).flatMap((item): PeakStage[] => {
    const info = asRecord(item);
    if (!info) return [];
    const mazeId = numberOf(info.maze_id);
    const mob = mobRecords.find((r) => mazeId !== null && numberOf(r.maze_id) === mazeId) ?? null;
    const cleared = boolOf(mob?.has_challenge_record) ?? false;
    const mobNeed: Need = cleared ? need : (v) => v;
    return [
      {
        name: need(text(info.monster_name) ?? text(info.name), at("mob_infos[].monster_name")),
        icon: image(info.monster_icon),
        cleared,
        stars: cleared ? mobNeed(numberOf(mob?.star_num), at("mob_records[].star_num")) : null,
        rounds: cleared ? mobNeed(numberOf(mob?.round_num), at("mob_records[].round_num")) : null,
        quickClear: cleared ? boolOf(mob?.is_fast) : null,
        avatars: cleared ? teamMembers(Array.isArray(mob?.avatars) ? mob.avatars : [], mobNeed, at("mob_records[].avatars")) : [],
      },
    ];
  });

  return [
    {
      hasData: declared ?? (bossCleared || knights.some((k) => k.cleared)),
      name: need(text(group?.name_mi18n), at("group.name_mi18n")),
      version: text(group?.game_version),
      begin: need(formatPartialTime(group?.begin_time), at("group.begin_time")),
      end: need(formatPartialTime(group?.end_time), at("group.end_time")),
      theme: image(group?.theme_pic_path),
      battles: need(numberOf(record.battle_num), at("battle_num")),
      bossStars: need(numberOf(record.boss_stars), at("boss_stars")),
      knightStars: need(numberOf(record.mob_stars), at("mob_stars")),
      boss: {
        name: need(text(bossInfo?.name_mi18n), at("boss_info.name_mi18n")),
        icon: image(bossInfo?.icon),
        cleared: bossCleared,
        hardMode: bossCleared && (boolOf(bossRecord?.hard_mode) ?? false),
        hardModeName: text(bossInfo?.hard_mode_name_mi18n),
        stars: bossCleared ? recordNeed(numberOf(bossRecord?.star_num), at("boss_record.star_num")) : null,
        rounds: bossCleared ? recordNeed(numberOf(bossRecord?.round_num), at("boss_record.round_num")) : null,
        quickClear: null,
        buff: bossCleared ? parseBuff(bossRecord?.buff, recordNeed) : null,
        medal: bossCleared ? image(bossRecord?.challenge_peak_rank_icon) : null,
        avatars: bossCleared ? teamMembers(Array.isArray(bossRecord?.avatars) ? bossRecord.avatars : [], recordNeed, at("boss_record.avatars")) : [],
      },
      knights,
    },
  ];
}

export function parsePeak(data: unknown): PeakResult {
  const root = asRecord(data);
  const missing = createMissing();
  const records = missing.list(root, "challenge_peak_records", "challenge_peak_records");
  const ordered = records.map((value, index) => ({ value, index, key: timeKey(asRecord(asRecord(value)?.group)?.begin_time) }));
  // HoYoLAB 回最近幾期 照開始時間新的在前 本期才會是第一個
  ordered.sort((a, b) => b.key - a.key || a.index - b.index);
  return { peak: { seasons: ordered.flatMap(({ value }) => parseSeason(value, missing)) }, missing: missing.sorted() };
}
