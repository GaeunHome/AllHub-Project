import type { Cue } from "./format";

export type Batch = { start: number; end: number }; // cue 索引 end 不含

type Translated = (string | null)[];

// 批次越大回應越久 拖到新位置後要等更久 太小則前後文不足 請求次數也多
const MAX_CUES = 30;
const MAX_CHARS = 3000;
/** 小批次回應快 播放位置的字幕幾秒內就能出現 */
const FIRST_BATCH_CUES = 10;
/** 這麼快就會播到的句子等不及正常大小的批次 */
const URGENT_MS = 15_000;
/** 前方先翻好這麼遠 看的時候才不會追上翻譯 之後再從頭補完給重看與下載 */
const LOOKAHEAD_MS = 150_000;

const isPending = (translated: Translated, i: number) => translated[i] == null;

/** 遇到翻好的句子就停 不重複花錢 單句超過字數上限也自成一批 才不會卡住 */
function pendingRun(cues: Cue[], translated: Translated, start: number, maxCues: number): Batch {
  let end = start;
  let chars = 0;
  while (end < cues.length && end - start < maxCues && isPending(translated, end)) {
    const length = cues[end].text.length;
    if (end > start && chars + length > MAX_CHARS) break;
    chars += length;
    end++;
  }
  return { start, end };
}

/** 從還沒結束的第一句找起 停在兩句中間時才從下一句開始 不是已經播完的那句 */
function firstPendingAhead(cues: Cue[], translated: Translated, positionMs: number): number {
  const anchor = cues.findIndex((cue) => cue.end > positionMs);
  if (anchor < 0) return -1;
  for (let i = anchor; i < cues.length && cues[i].start < positionMs + LOOKAHEAD_MS; i++) {
    if (isPending(translated, i)) return i;
  }
  return -1;
}

/** 先顧播放位置前方 翻好了才從頭依序補 沒有播放位置就從頭翻 全部翻完回 null */
export function pickNextBatch(cues: Cue[], translated: Translated, positionMs?: number): Batch | null {
  if (positionMs !== undefined) {
    const ahead = firstPendingAhead(cues, translated, positionMs);
    if (ahead >= 0) return pendingRun(cues, translated, ahead, cues[ahead].start < positionMs + URGENT_MS ? FIRST_BATCH_CUES : MAX_CUES);
  }
  const first = cues.findIndex((_, i) => isPending(translated, i));
  return first < 0 ? null : pendingRun(cues, translated, first, MAX_CUES);
}
