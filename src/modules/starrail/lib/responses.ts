// 介面沒有公開文件、欄位依 genshin.py 整理且尚未用真實帳號驗證，所以讀不到的欄位一律給 null，原始 JSON 另外保留供除錯

import { formatTaipeiHourMinute, formatTaipeiMonthDay, taipeiDateKey } from "@/core/time";

export type HoyolabResult<T> =
  | { ok: true; data: T; raw: unknown }
  | { ok: false; retcode: number | null; message: string; cookieInvalid: boolean; raw: unknown };

/** -100：未登入；10001：cookie 無效 */
const COOKIE_INVALID_CODES = new Set([-100, 10001]);

/** 回應裡的 retcode；格式不對時回 null */
export function retcodeOf(json: unknown): number | null {
  const retcode = asRecord(json)?.retcode;
  return typeof retcode === "number" ? retcode : null;
}

export function interpretResponse(json: unknown): HoyolabResult<unknown> {
  const body = asRecord(json);
  const retcode = retcodeOf(json);
  const message = typeof body?.message === "string" ? body.message : "";

  if (retcode === 0) return { ok: true, data: body?.data ?? null, raw: json };

  const cookieInvalid = retcode !== null && COOKIE_INVALID_CODES.has(retcode);
  return {
    ok: false,
    retcode,
    message: cookieInvalid
      ? `HoYoLAB cookie 已失效，請重新登入 hoyolab.com 後貼上新的 cookie（${retcode}：${message}）`
      : retcode === null
        ? typeof body?.localError === "string"
          ? body.localError
          : "HoYoLAB 回應格式和預期不同"
        : `HoYoLAB 回應錯誤（${retcode}：${message}）`,
    cookieInvalid,
    raw: json,
  };
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
    return [{ uid, nickname: str(role?.nickname), region, regionName: str(role?.region_name), level: num(role?.level) }];
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
    stamina: num(note?.current_stamina),
    maxStamina: num(note?.max_stamina),
    staminaRecoverSeconds: num(note?.stamina_recover_time),
    reserveStamina: num(note?.current_reserve_stamina),
    // 「epedition」是 HoYoLAB 原本的拼字
    expeditionsAccepted: num(note?.accepted_epedition_num),
    expeditionsTotal: num(note?.total_expedition_num),
    trainScore: num(note?.current_train_score),
    maxTrainScore: num(note?.max_train_score),
    rogueScore: num(note?.current_rogue_score),
    maxRogueScore: num(note?.max_rogue_score),
    cocoonRemaining: num(note?.weekly_cocoon_cnt),
    cocoonLimit: num(note?.weekly_cocoon_limit),
  };
}

/** 開拓力回滿的時間點；已滿或讀不到時回 null */
export function staminaFullAt(note: DailyNote, now: Date): Date | null {
  if (note.staminaRecoverSeconds === null || note.staminaRecoverSeconds <= 0) return null;
  return new Date(now.getTime() + note.staminaRecoverSeconds * 1000);
}

export function formatTaipeiTime(date: Date, now: Date): string {
  // 用台北的年月日算相差幾天；開拓力從 0 回滿要約 30 小時，可能跨兩天
  const taipeiDay = (d: Date) => Date.parse(taipeiDateKey(d));
  const days = Math.round((taipeiDay(date) - taipeiDay(now)) / 86_400_000);
  const time = formatTaipeiHourMinute(date);
  if (days === 0) return `今天 ${time}`;
  if (days === 1) return `明天 ${time}`;
  return `${formatTaipeiMonthDay(date)} ${time}`;
}

export type CheckinInfo = { isSigned: boolean | null; totalSignDay: number | null };

export function parseCheckinInfo(data: unknown): CheckinInfo {
  const info = asRecord(data);
  return {
    isSigned: typeof info?.is_sign === "boolean" ? info.is_sign : null,
    totalSignDay: num(info?.total_sign_day),
  };
}

export type CheckinOutcome = { result: "success" | "already" | "failed"; message: string; cookieInvalid: boolean };

/** -5003：今天已經簽過 */
const ALREADY_SIGNED = -5003;

export function interpretSign(json: unknown): CheckinOutcome {
  const response = interpretResponse(json);
  if (!response.ok) {
    if (response.retcode === ALREADY_SIGNED) return { result: "already", message: "今天已經簽到過了", cookieInvalid: false };
    return { result: "failed", message: response.message, cookieInvalid: response.cookieInvalid };
  }

  // 被風控要求驗證碼時 retcode 仍是 0，要看 gt_result
  if (asRecord(asRecord(response.data)?.gt_result)?.is_risk === true) {
    return { result: "failed", message: "HoYoLAB 要求驗證碼，請到 HoYoLAB 網站手動簽到一次", cookieInvalid: false };
  }
  return { result: "success", message: "簽到成功", cookieInvalid: false };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function num(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function str(value: unknown): string | null {
  if (typeof value === "string" && value !== "") return value;
  if (typeof value === "number") return String(value);
  return null;
}
