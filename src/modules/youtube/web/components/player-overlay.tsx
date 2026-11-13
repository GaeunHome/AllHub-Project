import { Icon } from "@/core/ui/icon";
import { subtitleDisplay, type SubtitleLang } from "../subtitle-display";
import type { Cue, SubtitleMode } from "../../lib/subtitles/format";

// 疊在播放器上的字幕與右下角的按鈕

type SubtitleOverlayProps = {
  cue: Cue | undefined;
  translation: string | null | undefined;
  mode: SubtitleMode;
  translating: boolean;
};

/** 中文 韓文或雙語 還沒翻好時標翻譯中 */
export function SubtitleOverlay({ cue, translation, mode, translating }: SubtitleOverlayProps) {
  const display = cue === undefined ? null : subtitleDisplay(cue.text, translation, mode, translating);
  return (
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
  );
}

function SubtitleLine({ lang, secondary = false, badge, children }: { lang: SubtitleLang; secondary?: boolean; badge?: string; children: string }) {
  return (
    <p lang={lang} className={secondary ? "subtitle-line subtitle-line-secondary" : "subtitle-line"}>
      {children}
      {badge && <span className="subtitle-badge">{badge}</span>}
    </p>
  );
}

type PlayerControlsProps = { theater: boolean; fullscreen: boolean; onTheater: () => void; onFullscreen: () => void };

/** 劇院模式只在寬螢幕出現 全螢幕時按鈕寫出離開全螢幕 */
export function PlayerControls({ theater, fullscreen, onTheater, onFullscreen }: PlayerControlsProps) {
  const fullscreenLabel = fullscreen ? "離開全螢幕" : "全螢幕";
  const theaterLabel = theater ? "預設檢視" : "劇院模式";
  return (
    <div className="player-controls">
      {!fullscreen && (
        <button type="button" onClick={onTheater} aria-label={theaterLabel} title={`${theaterLabel}（t）`} aria-keyshortcuts="t" className="player-control hidden lg:inline-grid">
          <Icon name="rectangle-horizontal" className={theater ? "size-4" : "size-5"} />
        </button>
      )}
      <button
        type="button"
        onClick={onFullscreen}
        aria-label={fullscreenLabel}
        title={`${fullscreenLabel}（f）`}
        aria-keyshortcuts="f"
        className={fullscreen ? "player-control player-control-labeled" : "player-control"}
      >
        <Icon name={fullscreen ? "minimize" : "maximize"} className="size-5" />
        {fullscreen && fullscreenLabel}
      </button>
    </div>
  );
}
