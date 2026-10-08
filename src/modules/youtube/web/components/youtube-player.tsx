"use client";

import { useEffect, useImperativeHandle, useRef, useState, useSyncExternalStore, type ReactNode, type Ref } from "react";
import { Icon } from "@/core/ui/icon";
import { findCueIndex } from "../../lib/cue-lookup";
import type { Cue } from "../../lib/subtitles/format";
import { subtitleDisplay, type SubtitleMode } from "../subtitle-display";
import type { SubtitleSize } from "../subtitle-size";

type YtPlayer = { getCurrentTime(): number; destroy(): void };
type YtNamespace = { Player: new (element: HTMLElement, options: object) => YtPlayer };
declare global {
  interface Window {
    YT?: YtNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let apiPromise: Promise<YtNamespace> | undefined;
/** iframe_api 還會再載入一支 script，那支失敗時不會有任何事件，只能靠逾時發現 */
const LOAD_TIMEOUT_MS = 30_000;

/** 官方 IFrame Player API 只能用 script 載入，而且全頁只能載一次；失敗時清掉快取，下次掛載可以重試 */
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

const POLL_MS = 200;
/** IFrame Player API 的播放狀態；緩衝等其他狀態不算播放或暫停 */
const STATE = { ended: 0, playing: 1, paused: 2 };

const subscribeNothing = () => () => {};

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
  /** 沒有在翻（失敗、暫停）時，還沒翻好的句子不能標成「翻譯中」 */
  translating: boolean;
  /** 自動即時翻譯在使用者按下播放時才開始 */
  onPlayingChange?: (playing: boolean) => void;
  toolbar?: ReactNode;
};

export function YoutubePlayer({ ref, videoId, cues, translated, mode, subtitleSize, translating, onPlayingChange, toolbar }: YoutubePlayerProps) {
  const frameRef = useRef<HTMLDivElement>(null);
  const mountRef = useRef<HTMLDivElement>(null);
  const readyPlayerRef = useRef<YtPlayer | null>(null);
  const onPlayingChangeRef = useRef(onPlayingChange);
  const cuesRef = useRef(cues);
  const [index, setIndex] = useState(-1);
  // 記下載入失敗的是哪支影片，換影片時訊息自然消失
  const [failedVideoId, setFailedVideoId] = useState<string | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  // iPhone Safari 不能讓一般元素全螢幕；伺服器端先當作不支援，hydrate 後再依瀏覽器決定要不要顯示按鈕
  const canFullscreen = useSyncExternalStore(subscribeNothing, () => document.fullscreenEnabled, () => false);

  useEffect(() => {
    cuesRef.current = cues;
  }, [cues]);

  useEffect(() => {
    onPlayingChangeRef.current = onPlayingChange;
  }, [onPlayingChange]);

  // 翻譯每次呼叫前才問播放位置，不必為了它每 200ms 重新算繪
  useImperativeHandle(ref, () => ({ positionMs: () => (readyPlayerRef.current ? readyPlayerRef.current.getCurrentTime() * 1000 : undefined) }), []);

  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement === frameRef.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  useEffect(() => {
    let player: YtPlayer | undefined;
    let timer: ReturnType<typeof setInterval> | undefined;
    let cancelled = false;

    loadYoutubeApi().then(
      (YT) => {
        if (cancelled || !mountRef.current) return;
        // YT.Player 會把傳入的元素換成 iframe，所以給它一個自己的子元素，避免動到 React 管理的節點
        const target = document.createElement("div");
        mountRef.current.appendChild(target);
        player = new YT.Player(target, {
          videoId,
          width: "100%",
          height: "100%",
          // 改用我們自己的全螢幕（連字幕一起放大），所以能用時把 YouTube 那顆會讓字幕消失的全螢幕鈕藏起來
          playerVars: { rel: 0, cc_load_policy: 0, playsinline: 1, fs: document.fullscreenEnabled ? 0 : 1 },
          events: {
            onReady: () => {
              // 卸載後才 ready 的話不能再開計時器，否則沒有人會清掉它
              if (cancelled) return;
              readyPlayerRef.current = player ?? null;
              timer = setInterval(() => setIndex(findCueIndex(cuesRef.current, (player?.getCurrentTime() ?? 0) * 1000)), POLL_MS);
            },
            onStateChange: ({ data }: { data: number }) => {
              if (cancelled) return;
              if (data === STATE.playing) onPlayingChangeRef.current?.(true);
              else if (data === STATE.paused || data === STATE.ended) onPlayingChangeRef.current?.(false);
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
      readyPlayerRef.current = null;
      if (timer) clearInterval(timer);
      player?.destroy();
      mount?.replaceChildren();
    };
  }, [videoId]);

  const source = index >= 0 ? cues[index]?.text : undefined;
  const display = source === undefined ? null : subtitleDisplay(source, translated[index], mode, translating);

  const toggleFullscreen = () => {
    // 瀏覽器拒絕（例如沒有使用者手勢）時維持原狀即可，不必打斷觀看
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else frameRef.current?.requestFullscreen().catch(() => {});
  };

  return (
    <div className="flex flex-col gap-3">
      <div ref={frameRef} className="player-frame" data-subtitle-size={subtitleSize}>
        <div ref={mountRef} className="absolute inset-0 [&>iframe]:h-full [&>iframe]:w-full" />
        {failedVideoId === videoId && (
          <p className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-white/80">
            無法載入 YouTube 播放器（可能是網路中斷，或被瀏覽器外掛擋掉），請重新整理頁面再試。
          </p>
        )}
        {display && (
          // 疊在控制列上方；pointer-events-none 讓點擊仍能操作影片
          <div className="subtitle-overlay">
            <SubtitleLine badge={display.badge}>{display.primary}</SubtitleLine>
            {display.secondary !== undefined && <SubtitleLine secondary>{display.secondary}</SubtitleLine>}
          </div>
        )}
        {fullscreen && (
          <button type="button" onClick={toggleFullscreen} className="player-exit-fullscreen">
            <Icon name="x" className="size-4" />
            離開全螢幕
          </button>
        )}
      </div>
      {(toolbar || canFullscreen) && (
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          {toolbar}
          {canFullscreen && (
            <button type="button" onClick={toggleFullscreen} className="btn-secondary btn-sm ml-auto">
              <Icon name="tv" className="size-4" />
              全螢幕
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function SubtitleLine({ secondary = false, badge, children }: { secondary?: boolean; badge?: string; children: string }) {
  return (
    <p className={secondary ? "subtitle-line subtitle-line-secondary" : "subtitle-line"}>
      {children}
      {/* 小字、半透明，不搶字幕本身的視線 */}
      {badge && (
        <span className="ml-[0.5em] inline-block rounded-full bg-white/15 px-[0.5em] align-[0.1em] text-[0.55em] leading-normal font-medium whitespace-nowrap text-white/70">
          {badge}
        </span>
      )}
    </p>
  );
}
