import { describe, expect, it } from "vitest";
import { findCueIndex } from "../lib/cue-lookup";
import { JITTER_DEADBAND_MS, MAX_EXTRAPOLATION_MS, SEEK_BACK_TOLERANCE_MS, createPlaybackClock } from "./playback-clock";

describe("createPlaybackClock：播放中用經過的時間與播放速度內插，不等播放器下一次回報", () => {
  it("連續播放：兩次回報之間依經過的時間往前推，收到新的回報再校正", () => {
    const clock = createPlaybackClock();
    clock.setPlaying(true, 10_000, 0);

    expect(clock.estimate(0)).toBe(10_000);
    expect(clock.estimate(120)).toBe(10_120);
    clock.observe(10_250, 250);
    expect(clock.estimate(300)).toBe(10_300);
  });

  it("回報的值沒變（播放器還沒送來新的時間）：不當成新的回報，照樣往前推", () => {
    const clock = createPlaybackClock();
    clock.setPlaying(true, 10_000, 0);

    clock.observe(10_000, 100);

    expect(clock.estimate(100)).toBe(10_100);
  });

  it("暫停：停在暫停那一刻，不再往前推；之後收到的回報直接採用", () => {
    const clock = createPlaybackClock();
    clock.setPlaying(true, 0, 0);
    // 暫停的事件先到，播放器還沒送來暫停時的時間（getCurrentTime() 還是舊的 0）
    clock.setPlaying(false, 0, 1000);

    expect(clock.playing).toBe(false);
    expect(clock.estimate(1000)).toBe(1000);
    expect(clock.estimate(5000)).toBe(1000);
    clock.observe(990, 1100);
    expect(clock.estimate(1100)).toBe(990);
  });

  it("暫停時拖曳進度：馬上跳到新的時間，往前、往後都一樣", () => {
    const clock = createPlaybackClock();
    clock.observe(30_000, 0);
    expect(clock.estimate(10)).toBe(30_000);

    clock.observe(5_000, 500);
    expect(clock.estimate(510)).toBe(5_000);
  });

  it("繼續播放：從暫停的位置接著往前推", () => {
    const clock = createPlaybackClock();
    clock.observe(42_000, 0);

    clock.setPlaying(true, 42_000, 10_000);

    expect(clock.estimate(10_000)).toBe(42_000);
    expect(clock.estimate(10_500)).toBe(42_500);
  });

  it("播放中往後跳轉：回報一超前就跟上", () => {
    const clock = createPlaybackClock();
    clock.setPlaying(true, 1_000, 0);

    clock.observe(30_000, 200);

    expect(clock.estimate(200)).toBe(30_000);
    expect(clock.estimate(300)).toBe(30_100);
  });

  it("播放中往回跳轉：回報落後超過容許範圍就直接跳回去", () => {
    const clock = createPlaybackClock();
    clock.setPlaying(true, 30_000, 0);

    clock.observe(30_250 - SEEK_BACK_TOLERANCE_MS - 1, 250);

    expect(clock.estimate(250)).toBe(30_250 - SEEK_BACK_TOLERANCE_MS - 1);
    clock.observe(5_000, 500);
    expect(clock.estimate(500)).toBe(5_000);
  });

  it("回報倒退的小抖動（傳遞延遲變長）：時間不往回走，也不必拉回", () => {
    const clock = createPlaybackClock();
    clock.setPlaying(true, 0, 0);
    clock.observe(250, 250);

    clock.observe(500 - JITTER_DEADBAND_MS, 500);

    expect(clock.estimate(500)).toBe(500);
    expect(clock.estimate(700)).toBe(700);
  });

  it("回報一直比推算的慢（例如按下播放後影片晚一點才真的開始）：用一半的速度慢慢拉回，時間不往回走", () => {
    const clock = createPlaybackClock();
    clock.setPlaying(true, 0, 0);

    clock.observe(400, 500);

    expect(clock.estimate(500)).toBe(500);
    const later = [520, 540, 560, 580, 600, 650].map((now) => clock.estimate(now));
    for (let i = 1; i < later.length; i++) expect(later[i]).toBeGreaterThan(later[i - 1]);
    // 落後的 100ms 用 200ms 追回，之後照常前進
    expect(clock.estimate(700)).toBe(600);
    expect(clock.estimate(800)).toBe(700);
  });

  it("變速：依播放速度推進；換速度時從當下的時間接著算", () => {
    const clock = createPlaybackClock();
    clock.setRate(1.5, 0);
    clock.setPlaying(true, 0, 0);
    expect(clock.estimate(1000)).toBe(1500);

    clock.observe(1500, 1000);
    clock.setRate(2, 1000);
    expect(clock.estimate(1500)).toBe(2500);
  });

  it("不合理的播放速度（0、負數、NaN）不採用", () => {
    const clock = createPlaybackClock();
    for (const rate of [0, -1, Number.NaN]) clock.setRate(rate, 0);
    clock.setPlaying(true, 0, 0);

    expect(clock.estimate(1000)).toBe(1000);
  });

  it("緩衝：跟暫停一樣停在當下的時間", () => {
    const clock = createPlaybackClock();
    clock.setPlaying(true, 0, 0);
    clock.setPlaying(false, 0, 800);

    expect(clock.estimate(2000)).toBe(800);
  });

  it("回報中斷（播放器卡住、沒有再送新的時間）：最多往前推 MAX_EXTRAPOLATION_MS 就停", () => {
    const clock = createPlaybackClock();
    clock.setPlaying(true, 0, 0);

    expect(clock.estimate(60_000)).toBe(MAX_EXTRAPOLATION_MS);
  });
});

/** 固定種子的亂數：模擬的抖動每次都一樣，失敗時重跑得出來 */
function seeded(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

type Event = { at: number; kind: "seek"; to: number } | { at: number; kind: "rate"; rate: number };

/** 模擬真的 IFrame API：getCurrentTime() 只在收到 iframe 回報時更新（間隔 250ms 起跳、加抖動與傳遞延遲）；頁面每一幀（60fps）讀一次 */
function simulate({ durationMs, events = [], reportEveryMs = 250, jitterMs = 80, delayMs = 20 }: { durationMs: number; events?: Event[]; reportEveryMs?: number; jitterMs?: number; delayMs?: number }) {
  const random = seeded(7);
  const clock = createPlaybackClock();
  let truthAnchor = 0;
  let truthAt = 0;
  let rate = 1;
  const truth = (now: number) => truthAnchor + (now - truthAt) * rate;
  let reported = 0;
  const pending: { at: number; value: number }[] = [];
  let nextSample = reportEveryMs;
  const queue = [...events];
  const frames: { now: number; truth: number; estimate: number; discontinuity: boolean }[] = [];
  let discontinuityUntil = -1;

  clock.setPlaying(true, 0, 0);
  for (let now = 0; now <= durationMs; now += 1000 / 60) {
    while (queue.length && queue[0].at <= now) {
      const event = queue.shift()!;
      truthAnchor = truth(event.at);
      truthAt = event.at;
      if (event.kind === "seek") {
        truthAnchor = event.to;
        // 真的播放器跳轉完成後很快就回報當下的新時間
        pending.push({ at: event.at + 30, value: event.to + 30 * rate });
        discontinuityUntil = event.at + 30 + 1000 / 60;
      } else {
        rate = event.rate;
        clock.setRate(event.rate, now);
      }
    }
    while (nextSample <= now) {
      pending.push({ at: nextSample + random() * delayMs, value: truth(nextSample) });
      nextSample += reportEveryMs + random() * jitterMs;
    }
    pending.sort((a, b) => a.at - b.at);
    while (pending.length && pending[0].at <= now) reported = pending.shift()!.value;
    clock.observe(reported, now);
    frames.push({ now, truth: truth(now), estimate: clock.estimate(now), discontinuity: now <= discontinuityUntil });
  }
  return frames;
}

describe("模擬真的 IFrame API（每 250ms 左右才回報一次）", () => {
  it("每一幀推算的時間跟真實時間的誤差在 50ms 內，而且不會倒退", () => {
    const frames = simulate({ durationMs: 60_000 });

    const worst = Math.max(...frames.slice(30).map((f) => Math.abs(f.estimate - f.truth)));
    expect(worst).toBeLessThan(50);
    for (let i = 1; i < frames.length; i++) expect(frames[i].estimate).toBeGreaterThanOrEqual(frames[i - 1].estimate);
  });

  it("中途變速、往前跳轉、往回跳轉：收到跳轉後的回報就對齊，之後誤差仍在 50ms 內", () => {
    const frames = simulate({
      durationMs: 60_000,
      events: [
        { at: 10_000, kind: "rate", rate: 1.5 },
        { at: 20_000, kind: "seek", to: 45_000 },
        { at: 30_000, kind: "seek", to: 12_000 },
        { at: 40_000, kind: "rate", rate: 0.5 },
      ],
    });

    const settled = frames.slice(30).filter((f) => !f.discontinuity);
    expect(Math.max(...settled.map((f) => Math.abs(f.estimate - f.truth)))).toBeLessThan(50);
  });

  it("換句的時間跟 cue 開始時間的誤差在 50ms 內（字幕框不會晚將近半秒才換）", () => {
    const cues = Array.from({ length: 25 }, (_, i) => ({ start: 1000 + i * 2300, end: 1000 + i * 2300 + 2000 }));
    const frames = simulate({ durationMs: 60_000 });

    const errors: number[] = [];
    let index = -1;
    for (const frame of frames) {
      const next = findCueIndex(cues, frame.estimate);
      if (next !== index && next >= 0) errors.push(frame.truth - cues[next].start);
      index = next;
    }

    expect(errors).toHaveLength(cues.length);
    expect(Math.max(...errors.map(Math.abs))).toBeLessThan(50);
  });

  it("回報固定晚 80ms 才送到：推算的時間最多只晚那 80ms 加一幀，不會再多晚一個回報間隔", () => {
    const lag = simulateDelayed(80)
      .slice(60)
      .map((f) => f.truth - f.estimate);

    expect(Math.max(...lag)).toBeLessThanOrEqual(80 + 1000 / 60);
    expect(Math.min(...lag)).toBeGreaterThanOrEqual(0);
  });
});

/** 回報固定在取樣之後 delay 毫秒才送到（沒有抖動）的情況 */
function simulateDelayed(delay: number) {
  const clock = createPlaybackClock();
  const frames: { truth: number; estimate: number }[] = [];
  let reported = 0;
  clock.setPlaying(true, 0, 0);
  for (let now = 0; now <= 20_000; now += 1000 / 60) {
    // 每 250ms 取樣一次，delay 之後才讀得到
    const sampledAt = Math.floor((now - delay) / 250) * 250;
    if (sampledAt > 0) reported = sampledAt;
    clock.observe(reported, now);
    frames.push({ truth: now, estimate: clock.estimate(now) });
  }
  return frames;
}
