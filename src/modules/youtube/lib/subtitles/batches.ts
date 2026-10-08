import type { Cue } from "./format";

export type Batch = { start: number; end: number }; // cue 索引，end 不含

type Translated = (string | null)[];

// 一批回應越久，拖曳到新位置後要等越久才看到字幕；太小則前後文不足、請求次數多
const MAX_CUES = 30;
const MAX_CHARS = 3000;
/** 小批次回應快，播放位置的字幕幾秒內就能出現 */
const FIRST_BATCH_CUES = 10;
/** 這麼快就會播到的句子等不及正常大小的批次 */
const URGENT_MS = 15_000;
/** 前方先翻好這麼遠，看的時候才不會追上翻譯；之後再從頭補完整支影片給重看與下載 */
const LOOKAHEAD_MS = 150_000;

/** 批次太大容易漏句、被截斷；單句就超過字數上限時自成一批，避免卡住 */
export function planBatches(cues: Cue[], maxCues = MAX_CUES, maxChars = MAX_CHARS): Batch[] {
  const batches: Batch[] = [];
  let start = 0;
  let chars = 0;

  cues.forEach((cue, i) => {
    const length = cue.text.length;
    if (i > start && (i - start >= maxCues || chars + length > maxChars)) {
      batches.push({ start, end: i });
      start = i;
      chars = 0;
    }
    chars += length;
  });

  if (start < cues.length) batches.push({ start, end: cues.length });
  return batches;
}

const isPending = (translated: Translated, i: number) => translated[i] == null;

/** 遇到已翻好的句子就停，不重翻、不重複花錢；單句超過字數上限也自成一批，避免卡住 */
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

/** 從結束時間還沒到的第一句找起，停在兩句中間時才會從下一句開始，而不是已經播完的那句 */
function firstPendingAhead(cues: Cue[], translated: Translated, positionMs: number): number {
  const anchor = cues.findIndex((cue) => cue.end > positionMs);
  if (anchor < 0) return -1;
  for (let i = anchor; i < cues.length && cues[i].start < positionMs + LOOKAHEAD_MS; i++) {
    if (isPending(translated, i)) return i;
  }
  return -1;
}

/** 觀看中先顧正在看的地方（播放位置前方），翻好了才從頭依序補；沒有播放位置就從頭依序翻；全部翻完回 null */
export function pickNextBatch(cues: Cue[], translated: Translated, positionMs?: number): Batch | null {
  if (positionMs !== undefined) {
    const ahead = firstPendingAhead(cues, translated, positionMs);
    if (ahead >= 0) return pendingRun(cues, translated, ahead, cues[ahead].start < positionMs + URGENT_MS ? FIRST_BATCH_CUES : MAX_CUES);
  }
  const first = cues.findIndex((_, i) => isPending(translated, i));
  return first < 0 ? null : pendingRun(cues, translated, first, MAX_CUES);
}

/** next_batch 欄位沿用「從頭連續翻好幾批」的意思，翻譯順序改由 pickNextBatch 決定 */
export function countCompletedBatches(batches: Batch[], translated: Translated): number {
  const index = batches.findIndex((batch) => Array.from({ length: batch.end - batch.start }, (_, k) => batch.start + k).some((i) => isPending(translated, i)));
  return index < 0 ? batches.length : index;
}
