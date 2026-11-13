"use client";

import { useImperativeHandle, useRef, type Ref } from "react";
import type { Cue, SubtitleMode } from "../../lib/subtitles/format";
import type { PlayerSize } from "../player-size";
import type { SubtitleSize } from "../subtitle-size";
import { usePlayerFullscreen } from "../use-player-fullscreen";
import { usePlayerShortcuts } from "../use-player-shortcuts";
import { useYoutubePlayer } from "../use-youtube-player";
import { PlayerControls, SubtitleOverlay } from "./player-overlay";

export { YOUTUBE_PLAYER_VARS } from "../youtube-iframe-api";

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

/**
 * 播放器加上疊在上面的字幕與按鈕
 * 播放與字幕同步 全螢幕 快捷鍵各在自己的 hook
 */
export function YoutubePlayer({ ref, videoId, cues, translated, mode, subtitleSize, translating, size, onSizeChange, className, onPlayingChange }: YoutubePlayerProps) {
  const frameRef = useRef<HTMLDivElement>(null);
  const mountRef = useRef<HTMLDivElement>(null);
  const player = useYoutubePlayer({ videoId, mountRef, cues, onPlayingChange });
  const fullscreen = usePlayerFullscreen(frameRef);
  const theater = size === "theater";
  const toggleTheater = () => onSizeChange(theater ? "default" : "theater");
  usePlayerShortcuts(fullscreen, toggleTheater);

  // 翻譯每次呼叫前才問播放位置
  const { positionRef } = player;
  useImperativeHandle(ref, () => ({ positionMs: () => positionRef.current?.() }), [positionRef]);

  return (
    <div className={className ? `player-slot ${className}` : "player-slot"} data-size={size}>
      <div ref={frameRef} className="player-frame" data-fullscreen={fullscreen.mode} data-playing={player.playing ? "" : undefined} data-subtitle-size={subtitleSize}>
        <div className="player-stage">
          <div ref={mountRef} className="absolute inset-0 [&>iframe]:h-full [&>iframe]:w-full" />
          {player.failed && (
            <p className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-white/80">
              無法載入 YouTube 播放器（可能是網路中斷，或被瀏覽器外掛擋掉），請重新整理頁面再試。
            </p>
          )}
          <SubtitleOverlay cue={player.index >= 0 ? cues[player.index] : undefined} translation={translated[player.index]} mode={mode} translating={translating} />
          <PlayerControls theater={theater} fullscreen={fullscreen.mode !== "off"} onTheater={toggleTheater} onFullscreen={fullscreen.toggle} />
        </div>
      </div>
    </div>
  );
}
