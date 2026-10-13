/** 簽到紀錄直接列出的筆數：最多保留 14 天、可能有十幾到二十筆，全部列出會把並排的兌換碼卡片撐得很高 */
export const RECENT_CHECKINS = 5;

/** 紀錄已經是新的在前：最新幾筆直接列出，其餘照原本的順序收起來 */
export function splitRecentCheckins<T>(logs: T[], count = RECENT_CHECKINS): { recent: T[]; earlier: T[] } {
  return { recent: logs.slice(0, count), earlier: logs.slice(count) };
}
