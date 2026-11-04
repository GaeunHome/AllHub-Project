// 躍遷紀錄依 genshin.py 的 Warp 與 warp_history 整理 還沒用真實帳號驗證

import { asRecord, createMissing, numberOf, text } from "@/core/json";
import { interpretWith, type HoyolabResult } from "./responses";

/** 每個遊戲帳號最多留幾抽 使用者的決定 超過時移除最舊的 */
export const WARP_LIMIT = 10_000;

/** HoYoverse 一頁最多 20 筆 */
export const WARP_PAGE_SIZE = 20;

// 保底是遊戲規則 聯動卡池照同類型的算
export const WARP_BANNERS = [
  { id: 11, label: "角色活動", hardPity: 90 },
  { id: 12, label: "光錐活動", hardPity: 80 },
  { id: 1, label: "常駐", hardPity: 90 },
  { id: 2, label: "新手", hardPity: 50 },
  { id: 21, label: "聯動角色", hardPity: 90 },
  { id: 22, label: "聯動光錐", hardPity: 80 },
] as const;

export type WarpBanner = (typeof WARP_BANNERS)[number];

/** id 有 19 位數 超過 number 能精確表示的範圍 一律當字串 */
export type Warp = { id: string; bannerType: number; gachaId: number | null; itemId: number | null; name: string; itemType: string | null; rarity: number; time: Date };

export type WarpPage = { warps: Warp[]; missing: string[] };

const SERVER_TIME = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/;
const DEFAULT_TIME_ZONE = 8;

/** 回應的時間是伺服器當地的 沒有時區 時區另外寫在 region_time_zone */
function serverTime(value: unknown, zone: number): Date | null {
  const match = typeof value === "string" ? SERVER_TIME.exec(value) : null;
  if (!match) return null;
  const [, year, month, day, hour, minute, second] = match.map(Number);
  return new Date(Date.UTC(year, month - 1, day, hour - zone, minute, second));
}

/** 少了必要欄位的一筆略過 其他筆照常 log 只記欄位名稱 */
function parseWarpPage(data: unknown, bannerType: number): WarpPage {
  const missing = createMissing();
  const root = asRecord(data);
  const zone = numberOf(root?.region_time_zone) ?? DEFAULT_TIME_ZONE;
  const warps = (root ? missing.list(root, "list", "list") : []).flatMap((value): Warp[] => {
    const row = asRecord(value);
    const id = missing.need(text(row?.id), "list[].id");
    if (!id) return [];
    const rarity = missing.need(numberOf(row?.rank_type), "list[].rank_type");
    const name = missing.need(text(row?.name), "list[].name");
    const time = missing.need(serverTime(row?.time, zone), "list[].time");
    if (rarity === null || name === null || time === null) return [];
    return [{ id, bannerType, gachaId: numberOf(row?.gacha_id), itemId: numberOf(row?.item_id), name, itemType: text(row?.item_type), rarity, time }];
  });
  return { warps, missing: missing.sorted() };
}

export function interpretWarpPage(json: unknown, bannerType: number): HoyolabResult<WarpPage> {
  return interpretWith(json, (data) => parseWarpPage(data, bannerType));
}

/** 回應是網址編碼過的 解開才不會在送出時編碼兩次 */
export function parseAuthkey(data: unknown): string | null {
  const authkey = text(asRecord(data)?.authkey);
  return authkey ? decodeURIComponent(authkey) : null;
}

export type FiveStar = {
  id: string;
  name: string;
  itemType: string | null;
  time: Date;
  /** 上一個五星之後到這一個 算這一抽 */
  pulls: number;
  /** 最舊的那個 更早的紀錄可能已經拿不到 pulls 只是下限 */
  partial: boolean;
};

export type BannerSummary = {
  banner: WarpBanner;
  total: number;
  /** 最後一個五星之後抽了幾次 */
  pity: number;
  /** 紀錄裡沒有五星時 pity 只是下限 */
  pityKnown: boolean;
  remaining: number;
  /** 新的在前 */
  fiveStars: FiveStar[];
  /** 只算完整的 四捨五入 */
  average: number | null;
  latest: Date | null;
};

/** warps 要由舊到新 */
export function summarizeBanner(banner: WarpBanner, warps: readonly Warp[]): BannerSummary {
  const fiveStars: FiveStar[] = [];
  let pity = 0;
  for (const warp of warps) {
    pity += 1;
    if (warp.rarity !== 5) continue;
    fiveStars.push({ id: warp.id, name: warp.name, itemType: warp.itemType, time: warp.time, pulls: pity, partial: fiveStars.length === 0 });
    pity = 0;
  }
  const complete = fiveStars.filter((star) => !star.partial);
  return {
    banner,
    total: warps.length,
    pity,
    pityKnown: fiveStars.length > 0,
    remaining: Math.max(banner.hardPity - pity, 0),
    fiveStars: fiveStars.toReversed(),
    average: complete.length > 0 ? Math.round(complete.reduce((sum, star) => sum + star.pulls, 0) / complete.length) : null,
    latest: warps.at(-1)?.time ?? null,
  };
}
