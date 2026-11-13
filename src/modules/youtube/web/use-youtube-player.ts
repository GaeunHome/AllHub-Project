import { useEffect, useRef, useState, type RefObject } from "react";
import { flushSync } from "react-dom";
import { findCueIndex } from "../lib/cue-lookup";
import type { Cue } from "../lib/subtitles/format";
import { createPlaybackClock } from "./playback-clock";
import { loadYoutubeApi, PLAYER_STATE, YOUTUBE_PLAYER_VARS, type YtEvent, type YtPlayer } from "./youtube-iframe-api";

/** 暫停或緩衝時拖曳進度也要很快換句 但不必每一幀檢查 */
const IDLE_POLL_MS = 100;
/** 兩句之間的空檔不到這麼久就繼續顯示上一句 換句時字幕框才不會閃一下 */
const SUBTITLE_GAP_BRIDGE_MS = 250;

type Options = {
  videoId: string;
  /** 播放器掛在這個元素裡 */
  mountRef: RefObject<HTMLDivElement | null>;
  cues: Cue[];
  /** 自動即時翻譯在使用者按下播放時才開始 */
  onPlayingChange?: (playing: boolean) => void;
};

/**
 * 建立播放器並推算播放位置 index 是現在要顯示的字幕
 * positionRef 給翻譯問播放位置 還沒準備好或載入失敗時是 null
 */
export function useYoutubePlayer({ videoId, mountRef, cues, onPlayingChange }: Options) {
  const positionRef = useRef<(() => number) | null>(null);
  const onPlayingChangeRef = useRef(onPlayingChange);
  const cuesRef = useRef(cues);
  const [index, setIndex] = useState(-1);
  // 記下載入失敗的是哪支影片 換影片時訊息自然消失
  const [failedVideoId, setFailedVideoId] = useState<string | null>(null);
  // 播放中 YouTube 會收起控制列 字幕往下 播放器上的按鈕滑過才出現
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    cuesRef.current = cues;
  }, [cues]);

  useEffect(() => {
    onPlayingChangeRef.current = onPlayingChange;
  }, [onPlayingChange]);

  useEffect(() => {
    let player: YtPlayer | undefined;
    let ready = false;
    let cancelled = false;
    let frame = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let shown = -1;
    const clock = createPlaybackClock();

    const reported = () => (player ? player.getCurrentTime() * 1000 : 0);
    const notifyPlaying = (isPlaying: boolean) => onPlayingChangeRef.current?.(isPlaying);
    // 每一幀只做一次二分搜尋 換句時才重新算繪
    // 同步算繪讓新的一句跟偵測到的這一幀一起畫出來 不會晚一幀
    const show = (now: number) => {
      const next = findCueIndex(cuesRef.current, clock.estimate(now), { bridgeGapMs: SUBTITLE_GAP_BRIDGE_MS });
      if (next === shown) return;
      shown = next;
      flushSync(() => setIndex(next));
    };
    const stop = () => {
      cancelAnimationFrame(frame);
      clearTimeout(timer);
      frame = 0;
      timer = undefined;
    };
    // 播放中每一幀推算一次 暫停 緩衝或還沒有字幕時慢慢輪詢 分頁看不到時整個停掉
    const schedule = () => {
      stop();
      if (cancelled || !ready || document.hidden) return;
      if (clock.playing && cuesRef.current.length > 0) frame = requestAnimationFrame(tick);
      else timer = setTimeout(tick, IDLE_POLL_MS);
    };
    const tick = () => {
      const now = performance.now();
      clock.observe(reported(), now);
      show(now);
      schedule();
    };
    document.addEventListener("visibilitychange", schedule);

    loadYoutubeApi().then(
      (YT) => {
        if (cancelled || !mountRef.current) return;
        // YT.Player 會把傳入的元素換成 iframe 所以給它自己的子元素 免得動到 React 管理的節點
        const target = document.createElement("div");
        mountRef.current.appendChild(target);
        player = new YT.Player(target, {
          videoId,
          width: "100%",
          height: "100%",
          playerVars: { ...YOUTUBE_PLAYER_VARS },
          events: {
            onReady: () => {
              // 卸載後才 ready 的話不能再開始推算 否則沒人會停掉它
              if (cancelled) return;
              ready = true;
              // 分頁在背景時沒有逐幀推算 翻譯問位置時先讀一次最新的回報
              positionRef.current = () => {
                const now = performance.now();
                clock.observe(reported(), now);
                return clock.estimate(now);
              };
              const rate = player?.getPlaybackRate?.();
              if (rate) clock.setRate(rate, performance.now());
              tick();
            },
            onStateChange: ({ data }: YtEvent) => {
              if (cancelled) return;
              const now = performance.now();
              const isPlaying = data === PLAYER_STATE.playing;
              clock.setPlaying(isPlaying, reported(), now);
              setPlaying(isPlaying);
              if (isPlaying) notifyPlaying(true);
              else if (data === PLAYER_STATE.paused || data === PLAYER_STATE.ended) notifyPlaying(false);
              if (!ready) return;
              show(now);
              schedule();
            },
            onPlaybackRateChange: ({ data }: YtEvent) => {
              if (!cancelled) clock.setRate(data, performance.now());
            },
          },
        });
      },
      () => {
        if (!cancelled) setFailedVideoId(videoId);
      },
    );

    const mount = mountRef.current;
    return () => {
      cancelled = true;
      stop();
      document.removeEventListener("visibilitychange", schedule);
      positionRef.current = null;
      player?.destroy();
      mount?.replaceChildren();
      // Activity 藏起頁面時元件狀態會留著 再顯示時播放器卻是重新建立的
      // 所以字幕 播放中與載入失敗的訊息都回到初始值
      setIndex(-1);
      setPlaying(false);
      setFailedVideoId(null);
      notifyPlaying(false);
    };
  }, [videoId, mountRef]);

  return { index, playing, failed: failedVideoId === videoId, positionRef };
}
