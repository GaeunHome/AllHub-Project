// 介面沒有公開文件也還沒驗證 讀不到的欄位給 null

import { asRecord, boolOf, createMissing, numberOf } from "@/core/json";
import { formatTaipeiHourMinute, formatTaipeiMonthDay, taipeiDayOffset } from "@/core/time";
import { image } from "./image";
import { ALREADY_SIGNED, DAILY_LIMIT, DATA_NOT_PUBLIC, GEETEST, NOT_LOGGED_IN, TOO_FREQUENT } from "./retcodes";

export type HoyolabResult<T> = { ok: true; data: T } | { ok: false; retcode: number | null; message: string; cookieInvalid: boolean };

const COOKIE_INVALID_CODES = new Set(NOT_LOGGED_IN);

/** 常見的錯誤代碼給中文說明 不顯示 HoYoLAB 的英文原文 */
const GEETEST_HINT = "HoYoLAB 要求驗證碼：先到 HoYoLAB 網站打開戰績頁通過驗證，再回來重新整理";
const KNOWN_ERRORS: Record<number, string> = {
  [DAILY_LIMIT]: "HoYoLAB 今天的查詢次數已達上限，明天再試",
  [DATA_NOT_PUBLIC]: "資料沒有公開：到 HoYoLAB → 戰績 → 設定，打開對應的公開設定",
  [TOO_FREQUENT]: "HoYoLAB 說查詢太頻繁，過幾分鐘再試",
  ...Object.fromEntries(GEETEST.map((code) => [code, GEETEST_HINT])),
};

/** 回應裡的 retcode 格式不對時回 null */
function retcodeOf(json: unknown): number | null {
  const retcode = asRecord(json)?.retcode;
  return typeof retcode === "number" ? retcode : null;
}

export function interpretResponse(json: unknown): HoyolabResult<unknown> {
  const body = asRecord(json);
  const retcode = retcodeOf(json);
  const message = typeof body?.message === "string" ? body.message : "";

  if (retcode === 0) return { ok: true, data: body?.data ?? null };

  const cookieInvalid = retcode !== null && COOKIE_INVALID_CODES.has(retcode);
  const known = retcode === null ? undefined : KNOWN_ERRORS[retcode];
  return {
    ok: false,
    retcode,
    message: cookieInvalid
      ? `HoYoLAB cookie 已失效，請重新登入 hoyolab.com 後貼上新的 cookie（${retcode}：${message}）`
      : retcode === null
        ? typeof body?.localError === "string"
          ? body.localError
          : "HoYoLAB 回應格式和預期不同"
        : known
          ? `${known}（${retcode}）`
          : `HoYoLAB 回應錯誤（${retcode}：${message}）`,
    cookieInvalid,
  };
}

/** 成功時把 data 交給 parse 失敗原樣回傳 */
export function interpretWith<T>(json: unknown, parse: (data: unknown) => T): HoyolabResult<T> {
  const result = interpretResponse(json);
  return result.ok ? { ok: true, data: parse(result.data) } : result;
}

export type GameRole = { uid: string; nickname: string | null; region: string; regionName: string | null; level: number | null };

export function parseGameRoles(data: unknown): GameRole[] {
  const list = asRecord(data)?.list;
  if (!Array.isArray(list)) return [];
  return list.flatMap((item) => {
    const role = asRecord(item);
    const uid = str(role?.game_uid);
    const region = str(role?.region);
    if (!uid || !region) return [];
    return [{ uid, nickname: str(role?.nickname), region, regionName: str(role?.region_name), level: numberOf(role?.level) }];
  });
}

export type DailyNote = {
  stamina: number | null;
  maxStamina: number | null;
  /** 距離開拓力回滿的秒數 */
  staminaRecoverSeconds: number | null;
  reserveStamina: number | null;
  expeditionsAccepted: number | null;
  expeditionsTotal: number | null;
  trainScore: number | null;
  maxTrainScore: number | null;
  rogueScore: number | null;
  maxRogueScore: number | null;
  cocoonRemaining: number | null;
  cocoonLimit: number | null;
};

export function parseDailyNote(data: unknown): DailyNote {
  const note = asRecord(data);
  return {
    stamina: numberOf(note?.current_stamina),
    maxStamina: numberOf(note?.max_stamina),
    staminaRecoverSeconds: numberOf(note?.stamina_recover_time),
    reserveStamina: numberOf(note?.current_reserve_stamina),
    // epedition 是 HoYoLAB 原本的拼字
    expeditionsAccepted: numberOf(note?.accepted_epedition_num),
    expeditionsTotal: numberOf(note?.total_expedition_num),
    trainScore: numberOf(note?.current_train_score),
    maxTrainScore: numberOf(note?.max_train_score),
    rogueScore: numberOf(note?.current_rogue_score),
    maxRogueScore: numberOf(note?.max_rogue_score),
    cocoonRemaining: numberOf(note?.weekly_cocoon_cnt),
    cocoonLimit: numberOf(note?.weekly_cocoon_limit),
  };
}

/** 委託 角色圖只收 http 與 https 網址 讀不到的欄位給 null */
export type Expedition = {
  name: string | null;
  status: "ongoing" | "finished" | null;
  remainingSeconds: number | null;
  avatars: string[];
};

export function parseExpeditions(data: unknown): Expedition[] {
  const list = asRecord(data)?.expeditions;
  if (!Array.isArray(list)) return [];
  return list.flatMap((item) => {
    const expedition = asRecord(item);
    if (!expedition) return [];
    const status = typeof expedition.status === "string" ? expedition.status.toLowerCase() : null;
    return [
      {
        name: typeof expedition.name === "string" && expedition.name !== "" ? expedition.name : null,
        status: status === "ongoing" || status === "finished" ? status : null,
        remainingSeconds: numberOf(expedition.remaining_time),
        avatars: Array.isArray(expedition.avatars) ? expedition.avatars.flatMap((avatar) => image(avatar) ?? []) : [],
      },
    ];
  });
}

/** 便箋最多是 5 分鐘前查的 剩餘時間要扣掉查詢後過去的時間 */
export type ExpeditionState = Expedition & { done: boolean };

export function expeditionStates(expeditions: Expedition[], fetchedAt: Date, now: Date): ExpeditionState[] {
  const elapsed = Math.max(0, Math.floor((now.getTime() - fetchedAt.getTime()) / 1000));
  return expeditions.map((expedition) => {
    const left = expedition.remainingSeconds === null ? null : Math.max(0, expedition.remainingSeconds - elapsed);
    const done = expedition.status === "finished" || left === 0;
    return { ...expedition, remainingSeconds: done ? 0 : left, done };
  });
}

/**
 * 還剩多久 委託與活動日曆共用 一天以上寫天 一天內寫到分
 * 時間到了回 null 已完成或已結束由畫面依情況寫
 */
export function formatRemaining(seconds: number | null): string | null {
  if (seconds === null || seconds <= 0) return null;
  if (seconds >= 86_400) return `剩 ${Math.floor(seconds / 86_400)} 天`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 1) return "剩不到 1 分鐘";
  if (minutes < 60) return `剩 ${minutes} 分鐘`;
  const rest = minutes % 60;
  return rest === 0 ? `剩 ${Math.floor(minutes / 60)} 小時` : `剩 ${Math.floor(minutes / 60)} 小時 ${rest} 分`;
}

/** 開拓力回滿的時間點 已滿或讀不到時回 null */
export function staminaFullAt(note: DailyNote, now: Date): Date | null {
  if (note.staminaRecoverSeconds === null || note.staminaRecoverSeconds <= 0) return null;
  return new Date(now.getTime() + note.staminaRecoverSeconds * 1000);
}

export function formatTaipeiTime(date: Date, now: Date): string {
  // 照台北的日曆算相差幾天 從 0 回滿要約 30 小時 可能跨兩天
  const days = taipeiDayOffset(date, now);
  const time = formatTaipeiHourMinute(date);
  if (days === 0) return `今天 ${time}`;
  if (days === 1) return `明天 ${time}`;
  return `${formatTaipeiMonthDay(date)} ${time}`;
}

/** 戰績首頁只用遊戲頭像 genshin.py 的 in_game_avatar 就是 cur_head_icon_url */
export type Profile = { avatar: string | null; missing: string[] };

export function parseProfile(data: unknown): Profile {
  const missing = createMissing();
  const avatar = missing.need(image(asRecord(data)?.cur_head_icon_url), "cur_head_icon_url");
  return { avatar, missing: missing.sorted() };
}

export type CheckinInfo = { isSigned: boolean | null; totalSignDay: number | null };

export function parseCheckinInfo(data: unknown): CheckinInfo {
  const info = asRecord(data);
  return {
    isSigned: boolOf(info?.is_sign),
    totalSignDay: numberOf(info?.total_sign_day),
  };
}

/** retcode 只給 log 用 回應原文可能帶有帳號資料 */
export type CheckinOutcome = { result: "success" | "already" | "failed"; message: string; cookieInvalid: boolean; retcode: number | null };

export function interpretSign(json: unknown): CheckinOutcome {
  const response = interpretResponse(json);
  const retcode = retcodeOf(json);
  if (!response.ok) {
    if (response.retcode === ALREADY_SIGNED) return { result: "already", message: "今天已經簽到過了", cookieInvalid: false, retcode };
    return { result: "failed", message: response.message, cookieInvalid: response.cookieInvalid, retcode };
  }

  // 被風控要求驗證碼時 retcode 仍是 0 要看 gt_result
  if (asRecord(asRecord(response.data)?.gt_result)?.is_risk === true) {
    return { result: "failed", message: "HoYoLAB 要求驗證碼，請到 HoYoLAB 網站手動簽到一次", cookieInvalid: false, retcode };
  }
  return { result: "success", message: "簽到成功", cookieInvalid: false, retcode };
}

function str(value: unknown): string | null {
  if (typeof value === "string" && value !== "") return value;
  if (typeof value === "number") return String(value);
  return null;
}
