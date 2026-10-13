type Timed = { start: number; end: number };

type Spans = { maxEnd: Float64Array; maxEndIndex: Int32Array };

/** 每一句之前（含）最晚的結束時間與是哪一句：往前找仍涵蓋的那句時，前面的都已經結束就可以停；同一份字幕只算一次 */
const spansCache = new WeakMap<readonly Timed[], Spans>();

function spansOf(cues: readonly Timed[]): Spans {
  const cached = spansCache.get(cues);
  if (cached) return cached;
  const maxEnd = new Float64Array(cues.length);
  const maxEndIndex = new Int32Array(cues.length);
  for (let i = 0; i < cues.length; i++) {
    const previous = i > 0 ? maxEnd[i - 1] : -Infinity;
    // 長度是 0 的句子從來不顯示，不能當成空檔前「最後顯示的那句」
    const later = cues[i].end > cues[i].start && cues[i].end >= previous;
    maxEnd[i] = later ? cues[i].end : previous;
    maxEndIndex[i] = later ? i : i > 0 ? maxEndIndex[i - 1] : -1;
  }
  const spans = { maxEnd, maxEndIndex };
  spansCache.set(cues, spans);
  return spans;
}

type FindOptions = {
  /** 上一句結束到下一句開始的空檔不超過這個長度時，空檔裡繼續顯示上一句（播放器換句時字幕框不會閃一下） */
  bridgeGapMs?: number;
};

/** 找出 ms 時正在顯示的字幕；cue 依開始時間排序，開始時間含、結束時間不含，重疊時取開始最晚、仍涵蓋的那句，沒有就回 -1。播放器每一幀都會呼叫，用二分搜尋 */
export function findCueIndex(cues: readonly Timed[], ms: number, { bridgeGapMs = 0 }: FindOptions = {}): number {
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
  if (last < 0) return -1;

  const { maxEnd, maxEndIndex } = spansOf(cues);
  for (let i = last; i >= 0 && maxEnd[i] > ms; i--) {
    if (ms < cues[i].end) return i;
  }

  // 沒有句子涵蓋 ms：前面的句子都結束了，最晚結束的那句跟下一句之間的空檔夠短就接起來
  const next = cues[last + 1];
  if (next && maxEndIndex[last] >= 0 && next.start - maxEnd[last] <= bridgeGapMs) return maxEndIndex[last];
  return -1;
}
