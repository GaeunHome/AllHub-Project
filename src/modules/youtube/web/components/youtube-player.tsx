"use client";

import { useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type Ref, type RefObject } from "react";
import { flushSync } from "react-dom";
import { Icon } from "@/core/ui/icon";
import { listenPageKeys } from "@/core/ui/popup-layer";
import { findCueIndex } from "../../lib/cue-lookup";
import type { Cue } from "../../lib/subtitles/format";
import { createPlaybackClock } from "../playback-clock";
import { fullscreenMode, fullscreenToggle, leaveFullscreen, lockPageScroll, type FullscreenMode } from "../player-fullscreen";
import { playerShortcut } from "../player-shortcuts";
import type { PlayerSize } from "../player-size";
import { subtitleDisplay, type SubtitleLang, type SubtitleMode } from "../subtitle-display";
import type { SubtitleSize } from "../subtitle-size";

type YtPlayer = { getCurrentTime(): number; getPlaybackRate?(): number; destroy(): void };
type YtEvent = { data: number };
type YtNamespace = { Player: new (element: HTMLElement, options: object) => YtPlayer };
declare global {
  interface Window {
    YT?: YtNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let apiPromise: Promise<YtNamespace> | undefined;
/** iframe_api 還會再載入一支 script 那支失敗時沒有任何事件 只能靠逾時發現 */
const LOAD_TIMEOUT_MS = 30_000;

/** 官方 API 只能用 script 載入 全頁只能載一次 失敗時清掉快取 下次掛載才能重試 */
function loadYoutubeApi(): Promise<YtNamespace> {
  apiPromise ??= new Promise<YtNamespace>((resolve, reject) => {
    if (window.YT?.Player) return resolve(window.YT);
    const script = document.createElement("script");
    const timer = setTimeout(() => fail(), LOAD_TIMEOUT_MS);
    const fail = () => {
      clearTimeout(timer);
      script.remove();
      reject(new Error("YouTube IFrame API 載入失敗"));
    };
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      clearTimeout(timer);
      previous?.();
      resolve(window.YT!);
    };
    script.src = "https://www.youtube.com/iframe_api";
    script.onerror = fail;
    document.head.appendChild(script);
  }).catch((error: unknown) => {
    apiPromise = undefined;
    throw error;
  });
  return apiPromise;
}

/**
 * YouTube 自己的全螢幕會讓疊上去的字幕消失 iPhone 也一律關掉改用自己的
 * 手機上維持在頁面裡播放
 */
export const YOUTUBE_PLAYER_VARS = { rel: 0, cc_load_policy: 0, playsinline: 1, fs: 0 } as const;

/** IFrame Player API 的播放狀態 緩衝也停止推算時間 */
const STATE = { ended: 0, playing: 1, paused: 2 };
/** 暫停或緩衝時拖曳進度也要很快換句 但不必每一幀檢查 */
const IDLE_POLL_MS = 100;
/** 兩句之間的空檔不到這麼久就繼續顯示上一句 換句時字幕框才不會閃一下 */
const SUBTITLE_GAP_BRIDGE_MS = 250;
/** 劇院模式只在寬螢幕有作用 跟版面的 lg 斷點一樣 */
const THEATER_MEDIA = "(min-width: 64rem)";

export type PlayerHandle = {
  /** 播放器還沒準備好或載入失敗時沒有播放位置 */
  positionMs(): number | undefined;
};

type YoutubePlayerProps = {
  ref?: Ref<PlayerHandle>;
  videoId: string;
  cues: Cue[];
  translated: (string | null)[];
  mode: SubtitleMode;
  subtitleSize: SubtitleSize;
  /** 失敗或暫停時 還沒翻好的句子不能標成翻譯中 */
  translating: boolean;
  size: PlayerSize;
  onSizeChange: (size: PlayerSize) => void;
  /** 加在外框上 例如劇院模式時在格線裡撐滿兩欄 */
  className?: string;
  /** 自動即時翻譯在使用者按下播放時才開始 */
  onPlayingChange?: (playing: boolean) => void;
};

export function YoutubePlayer({ ref, videoId, cues, translated, mode, subtitleSize, translating, size, onSizeChange, className, onPlayingChange }: YoutubePlayerProps) {
  const frameRef = useRef<HTMLDivElement>(null);
  const mountRef = useRef<HTMLDivElement>(null);
  const positionRef = useRef<(() => number) | null>(null);
  const onPlayingChangeRef = useRef(onPlayingChange);
  const cuesRef = useRef(cues);
  const [index, setIndex] = useState(-1);
  // 記下載入失敗的是哪支影片 換影片時訊息自然消失
  const [failedVideoId, setFailedVideoId] = useState<string | null>(null);
  // 播放中 YouTube 會收起控制列 字幕往下 播放器上的按鈕滑過才出現
  const [playing, setPlaying] = useState(false);
  const fullscreen = useFullscreen(frameRef);
  const theater = size === "theater";
  const isFullscreen = fullscreen.mode !== "off";
  const toggleTheater = () => onSizeChange(theater ? "default" : "theater");

  useEffect(() => {
    cuesRef.current = cues;
  }, [cues]);

  useEffect(() => {
    onPlayingChangeRef.current = onPlayingChange;
  }, [onPlayingChange]);

  // 翻譯每次呼叫前才問播放位置
  useImperativeHandle(ref, () => ({ positionMs: () => positionRef.current?.() }), []);

  // 焦點在 iframe 裡時按鍵到不了這裡 彈出層開著時讓給它 Esc 只關掉它
  // 每次算繪都重新掛上 拿到的一定是最新的狀態
  useEffect(() =>
    listenPageKeys((event) => {
      const shortcut = playerShortcut(event);
      if (shortcut === "fullscreen") {
        event.preventDefault();
        fullscreen.toggle();
      } else if (shortcut === "theater" && !isFullscreen && window.matchMedia(THEATER_MEDIA).matches) {
        event.preventDefault();
        toggleTheater();
      } else if (shortcut === "exit" && fullscreen.mode === "pseudo") {
        event.preventDefault();
        fullscreen.exitPseudo();
      }
    }),
  );

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
              const isPlaying = data === STATE.playing;
              clock.setPlaying(isPlaying, reported(), now);
              setPlaying(isPlaying);
              if (isPlaying) notifyPlaying(true);
              else if (data === STATE.paused || data === STATE.ended) notifyPlaying(false);
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
  }, [videoId]);

  const source = index >= 0 ? cues[index]?.text : undefined;
  const display = source === undefined ? null : subtitleDisplay(source, translated[index], mode, translating);
  const fullscreenLabel = isFullscreen ? "離開全螢幕" : "全螢幕";
  const theaterLabel = theater ? "預設檢視" : "劇院模式";

  return (
    <div className={className ? `player-slot ${className}` : "player-slot"} data-size={size}>
      <div ref={frameRef} className="player-frame" data-fullscreen={fullscreen.mode} data-playing={playing ? "" : undefined} data-subtitle-size={subtitleSize}>
        <div className="player-stage">
          <div ref={mountRef} className="absolute inset-0 [&>iframe]:h-full [&>iframe]:w-full" />
          {failedVideoId === videoId && (
            <p className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-white/80">
              無法載入 YouTube 播放器（可能是網路中斷，或被瀏覽器外掛擋掉），請重新整理頁面再試。
            </p>
          )}
          <div className="subtitle-area">
            {display && (
              <div className="subtitle-overlay">
                <SubtitleLine lang={display.primaryLang} badge={display.badge}>
                  {display.primary}
                </SubtitleLine>
                {display.secondary !== undefined && (
                  <SubtitleLine lang="ko" secondary>
                    {display.secondary}
                  </SubtitleLine>
                )}
              </div>
            )}
          </div>
          <div className="player-controls">
            {!isFullscreen && (
              <button type="button" onClick={toggleTheater} aria-label={theaterLabel} title={`${theaterLabel}（t）`} aria-keyshortcuts="t" className="player-control hidden lg:inline-grid">
                <Icon name="rectangle-horizontal" className={theater ? "size-4" : "size-5"} />
              </button>
            )}
            <button
              type="button"
              onClick={fullscreen.toggle}
              aria-label={fullscreenLabel}
              title={`${fullscreenLabel}（f）`}
              aria-keyshortcuts="f"
              className={isFullscreen ? "player-control player-control-labeled" : "player-control"}
            >
              <Icon name={isFullscreen ? "minimize" : "maximize"} className="size-5" />
              {isFullscreen && fullscreenLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

type Fullscreen = { mode: FullscreenMode; toggle: () => void; exitPseudo: () => void };

/** 能用 Fullscreen API 就讓外框連字幕一起全螢幕 iPhone 不能用或被拒絕時改用頁內全螢幕 */
function useFullscreen(frameRef: RefObject<HTMLDivElement | null>): Fullscreen {
  const [native, setNative] = useState(false);
  const [pseudo, setPseudo] = useState(false);

  useEffect(() => {
    // 以瀏覽器為準 按 Esc 切分頁或旋轉螢幕後都重新對一次 畫面不會卡在半全螢幕
    const sync = () => setNative(document.fullscreenElement !== null && document.fullscreenElement === frameRef.current);
    document.addEventListener("fullscreenchange", sync);
    document.addEventListener("visibilitychange", sync);
    window.addEventListener("resize", sync);
    return () => {
      document.removeEventListener("fullscreenchange", sync);
      document.removeEventListener("visibilitychange", sync);
      window.removeEventListener("resize", sync);
    };
  }, [frameRef]);

  // 頁內全螢幕時 html 不捲動 清除函式在收起 卸載或頁面被藏起來時立刻解除
  useLayoutEffect(() => (pseudo ? lockPageScroll(document.documentElement) : undefined), [pseudo]);

  // 卸載或被 Activity 藏起來時一定離開全螢幕 例如按上一頁或 iPhone 從左緣滑回
  // 藏起來的頁面收不到 fullscreenchange 回來時畫面與按鈕會對不上
  useLayoutEffect(() => {
    const frame = frameRef.current;
    return () => {
      leaveFullscreen(document, frame);
      setNative(false);
      setPseudo(false);
    };
  }, [frameRef]);

  const toggle = () => {
    const frame = frameRef.current;
    if (!frame) return;
    const action = fullscreenToggle(fullscreenMode({ native: document.fullscreenElement === frame, pseudo }), document.fullscreenEnabled === true);
    // 瀏覽器拒絕時退回頁內全螢幕 例如嵌在不允許全螢幕的頁面裡 照樣看得到字幕
    if (action === "enter-native") frame.requestFullscreen({ navigationUI: "hide" }).catch(() => setPseudo(true));
    else if (action === "exit-native") document.exitFullscreen().catch(() => {});
    else setPseudo(action === "enter-pseudo");
  };

  return { mode: fullscreenMode({ native, pseudo }), toggle, exitPseudo: () => setPseudo(false) };
}

function SubtitleLine({ lang, secondary = false, badge, children }: { lang: SubtitleLang; secondary?: boolean; badge?: string; children: string }) {
  return (
    <p lang={lang} className={secondary ? "subtitle-line subtitle-line-secondary" : "subtitle-line"}>
      {children}
      {badge && <span className="subtitle-badge">{badge}</span>}
    </p>
  );
}
