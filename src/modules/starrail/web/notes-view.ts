import type { StarrailAccountView } from "../service/accounts";
import type { DailyNoteFetch } from "../service/page-reads";

/** 開拓力到上限的九成才提醒 再低的話還來得及慢慢清 */
const STAMINA_ALERT_RATIO = 0.9;

export type AccountNotice = { tone: "danger" | "warning"; title: string; detail: string };

/** 首頁要提醒的事 一個帳號最多一件 cookie 失效時便箋讀不到 優先說這件 */
export function accountNotice(account: Pick<StarrailAccountView, "nickname">, result: DailyNoteFetch): AccountNotice | null {
  const name = account.nickname ?? "開拓者";
  if (!result.ok) return result.cookieInvalid ? { tone: "danger", title: "HoYoLAB cookie 已失效", detail: name } : null;
  const { stamina, maxStamina } = result.note;
  if (stamina === null || !maxStamina || stamina / maxStamina < STAMINA_ALERT_RATIO) return null;
  return { tone: "warning", title: "開拓力快滿了", detail: `${name} ${stamina} / ${maxStamina}` };
}
