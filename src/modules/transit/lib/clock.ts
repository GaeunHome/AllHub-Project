import { weekdayOfKey } from "@/core/time";

// TDX 的時間與服務日 火車時刻表與公車班表共用

const CLOCK = /^(\d{2}):(\d{2})/;

/** HH:mm 開頭的時間換成當天的第幾分鐘 後面多了秒也收 讀不到回 null */
export function clockMinutes(value: unknown): number | null {
  const match = typeof value === "string" ? CLOCK.exec(value) : null;
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** ServiceDay 的欄位名稱 星期照台灣的日期 不是伺服器的時區 */
export const serviceWeekday = (date: string) => WEEKDAYS[weekdayOfKey(date)];
