// 依 genshin.py 的 hsr_warp_records 整理 已用真實帳號確認
// 官方只給五星與已墊幾抽 沒有時間與三星四星

import { asRecord, boolOf, createMissing, numberOf, text } from "@/core/json";
import { interpretResponse, interpretWith, type HoyolabResult } from "./responses";

// 保底是遊戲規則 聯動卡池照同類型的算 limited 是有 UP 的卡池 常駐與新手回的 is_up 一律是 false
export const WARP_BANNERS = [
  { id: 11, label: "角色活動", hardPity: 90, gachaType: "GachaType_AvatarUp", limited: true },
  { id: 12, label: "光錐活動", hardPity: 80, gachaType: "GachaType_EquipmentUp", limited: true },
  { id: 1, label: "常駐", hardPity: 90, gachaType: "GachaType_Standard", limited: false },
  { id: 2, label: "新手", hardPity: 50, gachaType: "GachaType_Newbie", limited: false },
  { id: 21, label: "聯動角色", hardPity: 90, gachaType: "GachaType_CollabAvatarUp", limited: true },
  { id: 22, label: "聯動光錐", hardPity: 80, gachaType: "GachaType_CollabEquipmentUp", limited: true },
] as const;

export type WarpBanner = (typeof WARP_BANNERS)[number];

/** star 是 null 的那一列是目前已墊幾抽 其他是五星與它花了幾抽 */
export type WarpRow = { pulls: number; star: { name: string; isUp: boolean | null; icon: string | null } | null };

export type WarpCursor = { versionId: string; maxId: string };

/** incomplete 是還有下一頁卻問不到 算讀不完 少掉的紀錄會讓平均算錯 */
export type WarpPage = { rows: WarpRow[]; next: WarpCursor | null; incomplete: boolean; missing: string[] };

/** 活動頁靠 cookie_token_v2 登入 在別的地方登入就會換掉它 其他鍵照樣能用 */
const TOKEN_STALE = "躍遷紀錄無法讀取：cookie 裡的 cookie_token_v2 已過期，請登出 HoYoLAB 再登入，用「新增帳號或更新 cookie」重新貼上";
export const NEEDS_COOKIE_TOKEN = "躍遷紀錄要用 cookie 裡的 cookie_token_v2：請用「新增帳號或更新 cookie」重新貼上完整的 cookie";

const BADGE_TOKEN = "e_hkrpg_token";

/** 登入與讀紀錄被拒絕都是這個鍵的問題 便箋與簽到照樣能用 所以不說整個 cookie 失效 */
function explainRejected<T>(result: HoyolabResult<T>): HoyolabResult<T> {
  return !result.ok && result.cookieInvalid ? { ...result, message: TOKEN_STALE } : result;
}

/** 成功時回傳後面的請求要帶的 cookie 登入拿到的接在原本的後面 Set-Cookie 只取分號前面 */
export function interpretWarpLogin(json: unknown, cookie: string, setCookies: readonly string[]): HoyolabResult<string> {
  const result = explainRejected(interpretResponse(json));
  if (!result.ok) return result;
  const issued = setCookies.map((line) => line.split(";")[0].trim());
  if (!issued.some((pair) => pair.startsWith(`${BADGE_TOKEN}=`))) return { ok: false, retcode: null, message: "HoYoLAB 沒有回傳活動頁的登入資料，稍後再試", cookieInvalid: false };
  return { ok: true, data: [cookie, ...issued].join("; ") };
}

/** 19 位數的數字 JSON 解開就差了幾位 問下一頁會問錯 解開之前先寫成字串 */
export const quoteBigCursors = (body: string) => body.replace(/"(next_max_id|version_id)"\s*:\s*(\d{16,})/g, '"$1":"$2"');

const cursorPart = (value: unknown) => text(value) ?? (Number.isSafeInteger(value) ? String(value) : null);

/** 少了必要欄位的一筆略過 其他筆照常 log 只記欄位名稱 */
function parseWarpPage(data: unknown): WarpPage {
  const missing = createMissing();
  const root = asRecord(data);
  const rows = missing.list(root, "list", "list").flatMap((value): WarpRow[] => {
    const row = asRecord(value);
    const gotItem = missing.need(boolOf(row?.got_item), "list[].got_item");
    const pulls = missing.need(numberOf(row?.gacha_count), "list[].gacha_count");
    if (gotItem === null || pulls === null) return [];
    if (!gotItem) return [{ pulls, star: null }];
    const item = asRecord(row?.item);
    const name = missing.need(text(item?.name), "list[].item.name");
    if (name === null) return [];
    return [{ pulls, star: { name, isUp: missing.need(boolOf(row?.is_up), "list[].is_up"), icon: text(item?.icon) ?? text(item?.big_icon) } }];
  });
  const hasMore = missing.need(boolOf(root?.has_more), "has_more");
  if (hasMore === false) return { rows, next: null, incomplete: false, missing: missing.sorted() };
  const versionId = hasMore ? missing.need(cursorPart(root?.version_id), "version_id") : null;
  const maxId = hasMore ? missing.need(cursorPart(root?.next_max_id), "next_max_id") : null;
  const next = versionId !== null && maxId !== null ? { versionId, maxId } : null;
  return { rows, next, incomplete: next === null, missing: missing.sorted() };
}

export function interpretWarpPage(json: unknown): HoyolabResult<WarpPage> {
  return explainRejected(interpretWith(json, parseWarpPage));
}

export type FiveStar = {
  name: string;
  /** 官方的圖片網址 畫面用之前要經 externalAssetUrl */
  icon: string | null;
  pulls: number;
  /** 限定卡池抽到不是 UP 的 */
  lost: boolean;
};

export type BannerSummary = {
  banner: WarpBanner;
  /** 最後一個五星之後抽了幾次 */
  pity: number;
  remaining: number;
  /** 新的在前 */
  fiveStars: FiveStar[];
  /** 四捨五入 */
  average: number | null;
};

/** rows 照官方的順序 新的在前 */
export function summarizeBanner(banner: WarpBanner, rows: readonly WarpRow[]): BannerSummary {
  const fiveStars = rows.flatMap(({ pulls, star }): FiveStar[] => (star ? [{ name: star.name, icon: star.icon, pulls, lost: banner.limited && star.isUp === false }] : []));
  const pity = rows.find((row) => row.star === null)?.pulls ?? 0;
  return {
    banner,
    pity,
    remaining: Math.max(banner.hardPity - pity, 0),
    fiveStars,
    average: fiveStars.length > 0 ? Math.round(fiveStars.reduce((sum, star) => sum + star.pulls, 0) / fiveStars.length) : null,
  };
}
