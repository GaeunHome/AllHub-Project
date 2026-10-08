/** 找出 ms 時正在顯示的字幕；cue 依開始時間排序，沒有就回 -1。播放器每 200ms 呼叫一次，用二分搜尋 */
export function findCueIndex(cues: { start: number; end: number }[], ms: number): number {
  let low = 0;
  let high = cues.length - 1;
  let last = -1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    if (cues[mid].start <= ms) {
      last = mid;
      low = mid + 1;
    } else high = mid - 1;
  }
  // 往前找仍涵蓋這個時間的那句（字幕偶爾會重疊）
  for (let i = last; i >= 0 && i >= last - 5; i--) {
    if (ms < cues[i].end) return i;
  }
  return -1;
}
