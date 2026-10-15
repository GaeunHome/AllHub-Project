// 不依賴 React 清單上有從沒檢查過字幕的影片時 背景檢查完要重新整理才看得到
// 元件只負責接上計時器與分頁可見狀態

/** 背景檢查通常幾秒內就做完 太早重新整理還看不到結果 */
export const CAPTION_REFRESH_DELAY_MS = 4_000;
/** 背景一次只檢查 5 支 影片多時要刷好幾次 一直被擋時也不會一直重新整理 */
export const CAPTION_REFRESH_LIMIT = 3;

export type CaptionRefreshState = {
  /** 分頁看得到 看不到時不刷 切回來才排下一次 */
  visible: boolean;
  /** 上一次重新整理還沒回來 */
  refreshing: boolean;
  /** 這一輪連續刷了幾次 沒有要檢查的影片時元件會卸載 下次從 0 開始 */
  refreshed: number;
};

export function shouldRefreshForCaptions({ visible, refreshing, refreshed }: CaptionRefreshState): boolean {
  return visible && !refreshing && refreshed < CAPTION_REFRESH_LIMIT;
}
