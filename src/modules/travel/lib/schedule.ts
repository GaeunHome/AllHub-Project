// 時間不用手填 照順序與停留時間算出來 拖曳換順序後整天自動重排
// 這就是使用者用 Excel 時最麻煩的地方

/** 一天從幾點開始 第一個點可以用固定時間改 */
export const DAY_START_MINUTES = 9 * 60;
const MINUTES_PER_DAY = 24 * 60;

export type ScheduleInput = { id: number; stayMinutes: number; travelMinutes: number; fixedTime: string | null };

/** late 是比固定時間晚到幾分鐘 wait 是早到要等幾分鐘 */
export type ScheduledItem = { id: number; arrive: number; leave: number; late: number; wait: number };

export function clockToMinutes(value: string): number | null {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

/** 跨過午夜時寫隔天 手排到半夜是常見的錯 要看得出來 */
export function formatClock(minutes: number): string {
  const inDay = minutes % MINUTES_PER_DAY;
  const text = `${String(Math.floor(inDay / 60)).padStart(2, "0")}:${String(inDay % 60).padStart(2, "0")}`;
  return minutes >= MINUTES_PER_DAY ? `隔天 ${text}` : text;
}

/** 第一個點沒有上一站 交通時間不算 */
export function scheduleDay(items: readonly ScheduleInput[]): ScheduledItem[] {
  let clock = DAY_START_MINUTES;
  return items.map((item, index) => {
    const reached = index === 0 ? clock : clock + item.travelMinutes;
    const fixed = item.fixedTime === null ? null : clockToMinutes(item.fixedTime);
    // 第一個點的固定時間就是這一天的開始 不算早到也不算遲到
    const arrive = fixed !== null && (index === 0 || fixed >= reached) ? fixed : reached;
    const late = fixed !== null && index > 0 ? Math.max(0, reached - fixed) : 0;
    const wait = fixed !== null && index > 0 ? Math.max(0, fixed - reached) : 0;
    clock = arrive + item.stayMinutes;
    return { id: item.id, arrive, leave: clock, late, wait };
  });
}
