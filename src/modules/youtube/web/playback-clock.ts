/** 回報比推算的時間落後超過這個量才當成往回跳轉；更小的落後不往回跳，慢慢拉回，字幕不會在兩句之間來回閃 */
export const SEEK_BACK_TOLERANCE_MS = 250;

/** 回報送到頁面要一點時間、頁面又是每一幀才讀一次，落後這麼一點（以實際經過的時間計）是正常的，不必拉回 */
export const JITTER_DEADBAND_MS = 40;

/** 播放中太久沒收到新的回報（播放器卡住、iframe 沒有回應）就不再往前推，免得字幕一路跑到後面 */
export const MAX_EXTRAPOLATION_MS = 2000;

export type PlaybackClock = {
  readonly playing: boolean;
  /** 每一幀（或暫停時的輪詢）把 getCurrentTime() 的毫秒數交進來：值變了才是新的回報 */
  observe(reportedMs: number, now: number): void;
  /** 播放狀態改變（播放、暫停、緩衝、結束）時呼叫；reportedMs 是當下 getCurrentTime() 的值 */
  setPlaying(playing: boolean, reportedMs: number, now: number): void;
  setRate(rate: number, now: number): void;
  /** now 是 performance.now()：播放中依經過的時間與播放速度推算，其他狀態停在最後的位置 */
  estimate(now: number): number;
};

/** 真的 IFrame API 的 getCurrentTime() 是最後一次收到 iframe 回報的值，大約每 250ms 才更新：播放中記下錨點，用經過的時間內插出現在的位置 */
export function createPlaybackClock(): PlaybackClock {
  let playing = false;
  let rate = 1;
  let anchorMs = 0;
  let anchorAt = 0;
  // 小幅落後時還沒追回的量（負數）：用一半的播放速度慢慢扣掉，時間不往回走
  let slewMs = 0;
  let lastReported: number | null = null;
  let lastReportAt = 0;

  const estimate = (now: number): number => {
    if (!playing) return anchorMs;
    const elapsed = Math.max(0, Math.min(now, lastReportAt + MAX_EXTRAPOLATION_MS) - anchorAt);
    return anchorMs + elapsed * rate + Math.max(slewMs, -0.5 * rate * elapsed);
  };

  const anchor = (ms: number, now: number, slew = 0) => {
    anchorMs = ms;
    anchorAt = now;
    slewMs = slew;
  };

  const observe = (reportedMs: number, now: number) => {
    if (reportedMs === lastReported) return;
    lastReported = reportedMs;
    lastReportAt = now;
    if (!playing) return anchor(reportedMs, now);
    const current = estimate(now);
    const drift = reportedMs - current;
    // 回報追上或超前：真實的時間至少到這裡，直接採用；落後太多是往回跳轉，直接跳回去
    if (drift >= 0 || drift < -SEEK_BACK_TOLERANCE_MS) anchor(reportedMs, now);
    else anchor(current, now, drift < -JITTER_DEADBAND_MS * rate ? drift : 0);
  };

  return {
    get playing() {
      return playing;
    },
    observe,
    estimate,
    setPlaying(next, reportedMs, now) {
      if (next === playing) return observe(reportedMs, now);
      if (next) {
        observe(reportedMs, now);
        anchor(anchorMs, now);
        // 開始播放本身就是一次同步：從這裡起算多久沒有新的回報
        lastReportAt = now;
        playing = true;
        return;
      }
      // 暫停的事件常比暫停時的時間先到：先停在推算的位置，等新的回報再對齊
      anchor(estimate(now), now);
      playing = false;
      observe(reportedMs, now);
    },
    setRate(next, now) {
      if (!(next > 0)) return;
      anchor(estimate(now), now);
      rate = next;
    },
  };
}
