"use client";

import { useRef, useState, type ReactNode } from "react";
import { Icon, type UiIconName } from "@/core/ui/icon";
import type { SubtitleMode } from "../../lib/subtitles/format";
import { shouldAutoContinue, shouldAutoStart, useAutoTranslate } from "../auto-translate";
import { usePlayerSize } from "../player-size";
import { SUBTITLE_SIZES, useSubtitleSize } from "../subtitle-size";
import { AutoSavedContext } from "./save-video-button";
import { StartPanel, useStartTranslation } from "./start-panel";
import { TranslationPanel, type WatchTranslation } from "./translation-panel";
import { isActive, type LiveUpdate } from "./watch-panel-parts";
import { YoutubePlayer, type PlayerHandle } from "./youtube-player";

const MODES: { id: SubtitleMode; label: string }[] = [
  { id: "zh", label: "中文" },
  { id: "both", label: "雙語" },
  { id: "ko", label: "韓文" },
];

type WatchClientProps = {
  videoId: string;
  /** 播放器下方的標題 是伺服器元件 可能還在串流 */
  title: ReactNode;
  /** 標題下方頻道列的左半邊 頭像與頻道名稱 */
  channel: ReactNode;
  /** 伺服器端翻譯狀態的版本 開始 上傳 重試或重新翻譯後會換掉 */
  translationKey: string;
  translation: WatchTranslation | null;
  /**
   * 目前的供應商還沒設定 API Key 時的提示 有金鑰時是 null
   * 翻譯共用 沒有金鑰的人只能看已經翻好的部分
   */
  apiKeyMissing: string | null;
  /** 能不能重新翻譯或上傳字幕 只有發起人或站長 還沒有翻譯時大家都可以 */
  canManage: boolean;
  /** 是不是觀看者自己發起的 別人發起的不自動用他的 API Key 接著翻 */
  startedByViewer: boolean;
  settingsHref: string;
};

/** 照 YouTube 的觀看頁排 翻譯按鈕在頻道列右邊 翻譯進度放在像說明欄的灰色區塊 */
export function WatchClient({ videoId, title, channel, translationKey, translation, apiKeyMissing, canManage, startedByViewer, settingsHref }: WatchClientProps) {
  const [mode, setMode] = useState<SubtitleMode>("both");
  const [subtitleSize, setSubtitleSize] = useSubtitleSize();
  const [playerSize, setPlayerSize] = usePlayerSize();
  const theater = playerSize === "theater";
  const [autoTranslate, setAutoTranslate] = useAutoTranslate();
  const starter = useStartTranslation(videoId);
  const playerRef = useRef<PlayerHandle>(null);
  const playingRef = useRef(false);
  const autoAttemptedRef = useRef(false);
  // 按過用我的 API Key 繼續翻譯 開始或重試後這一頁都接著翻 面板重新掛載也記得
  // 記的是影片 id 換影片就要重新按
  const [consentedVideo, setConsentedVideo] = useState<string | null>(null);
  const consent = () => setConsentedVideo(videoId);
  // 續翻後伺服器把影片加進了保留清單 但續翻不重繪頁面
  // 頻道列的保留靠這個當場改成已保留
  const [autoSavedVideo, setAutoSavedVideo] = useState<string | null>(null);
  const autoContinue = shouldAutoContinue({
    active: isActive(translation?.status),
    apiKeyMissing: apiKeyMissing !== null,
    startedByViewer,
    consented: consentedVideo === videoId,
  });
  // 翻譯中每批回來就更新 播放器可以先顯示翻好的部分
  // 伺服器端狀態換了就改用伺服器給的資料
  const [live, setLive] = useState<{ key: string; translated: (string | null)[]; translating: boolean } | null>(null);
  const current = live?.key === translationKey ? live : null;
  const translated = current?.translated ?? translation?.translated ?? [];
  const translating = current?.translating ?? autoContinue;

  const report = ({ translated: next, translating: nowTranslating }: LiveUpdate) =>
    setLive((previous) => ({
      key: translationKey,
      translated: next ?? (previous?.key === translationKey ? previous.translated : (translation?.translated ?? [])),
      translating: nowTranslating,
    }));

  /** 只在觀看頁播放時翻譯 同一頁只自動試一次 抓不到字幕時不會每按一次播放就重抓 */
  const autoStart = (enabled: boolean) => {
    const attempted = autoAttemptedRef.current || starter.result !== null;
    if (!shouldAutoStart({ enabled, hasTranslation: translation !== null, apiKeyMissing: apiKeyMissing !== null, attempted, pending: starter.pending })) return;
    autoAttemptedRef.current = true;
    starter.start();
  };

  const changeAutoTranslate = (on: boolean) => {
    setAutoTranslate(on);
    // 播放中才打開也算數 不必再按一次播放
    if (on && playingRef.current) autoStart(true);
  };

  // 字幕語言與大小放在膠囊的後段 全螢幕與劇院模式的按鈕在播放器上
  const playerControls = translation && (
    <>
      <PillChoice label="字幕語言" icon="captions" options={MODES} value={mode} onChange={setMode} />
      <PillChoice label="字幕大小" text="大小" options={SUBTITLE_SIZES} value={subtitleSize} onChange={setSubtitleSize} />
    </>
  );

  return (
    <AutoSavedContext value={{ videoId: autoSavedVideo, clear: () => setAutoSavedVideo(null) }}>
      {/* 劇院模式在寬螢幕拆開這一層 播放器撐滿兩欄 標題 翻譯面板與接下來播放排到下一列 */}
      <div className={theater ? "stack min-w-0 lg:contents" : "stack min-w-0"}>
        <YoutubePlayer
          // 換影片時整個重建 上一支的字幕與播放狀態不會留到下一支
          key={videoId}
          ref={playerRef}
          videoId={videoId}
          cues={translation?.cues ?? []}
          translated={translated}
          mode={mode}
          subtitleSize={subtitleSize}
          translating={translating}
          size={playerSize}
          onSizeChange={setPlayerSize}
          className={theater ? "lg:col-span-2" : undefined}
          onPlayingChange={(playing) => {
            playingRef.current = playing;
            if (playing) autoStart(autoTranslate);
          }}
        />
        <div className="stack min-w-0">
          {title}
          {translation ? (
            // 伺服器端狀態換了只重建這個面板 播放器保留 影片不會重新載入
            <TranslationPanel
              key={translationKey}
              videoId={videoId}
              channel={channel}
              controls={playerControls}
              translation={translation}
              // 播放器還沒準備好時影片也是從頭播 先從頭翻
              position={() => playerRef.current?.positionMs() ?? 0}
              apiKeyMissing={apiKeyMissing}
              canManage={canManage}
              autoContinue={autoContinue}
              onConsent={consent}
              onSaved={() => setAutoSavedVideo(videoId)}
              settingsHref={settingsHref}
              onUpdate={report}
            />
          ) : (
            <StartPanel
              videoId={videoId}
              channel={channel}
              controls={playerControls}
              starter={starter}
              autoTranslate={autoTranslate}
              onAutoTranslateChange={changeAutoTranslate}
              onConsent={consent}
              apiKeyMissing={apiKeyMissing}
              settingsHref={settingsHref}
            />
          )}
        </div>
      </div>
    </AutoSavedContext>
  );
}

type PillChoiceProps<T extends string> = {
  label: string;
  icon?: UiIconName;
  text?: string;
  options: readonly { id: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
};

/** 一組互斥的選項收在同一顆膠囊裡 例如字幕語言與大小 */
function PillChoice<T extends string>({ label, icon, text, options, value, onChange }: PillChoiceProps<T>) {
  return (
    <div role="group" aria-label={label} className="yt-segmented">
      {icon && <Icon name={icon} className="size-4" />}
      {text && <span aria-hidden>{text}</span>}
      {options.map((option) => (
        <button key={option.id} type="button" aria-pressed={option.id === value} onClick={() => onChange(option.id)}>
          {option.label}
        </button>
      ))}
    </div>
  );
}
