"use client";

import Link from "next/link";
import { unstable_rethrow } from "next/navigation";
import { useActionState, useEffect, useId, useRef, useState, useTransition, type ReactNode } from "react";
import { ConfirmSubmitButton } from "@/core/ui/confirm-submit-button";
import { FormFeedback, FormMessage } from "@/core/ui/form-message";
import { Icon, type UiIconName } from "@/core/ui/icon";
import { MoreMenu } from "@/core/ui/more-menu";
import {
  continueTranslationAction,
  restartTranslationAction,
  retryTranslationAction,
  startTranslationAction,
  uploadSubtitlesAction,
  type FormState,
  type StartState,
} from "../actions";
import type { SourceKind } from "../../data/schema";
import type { Cue } from "../../lib/subtitles/format";
import type { Progress } from "../../service/translation";
import { shouldAutoContinue, shouldAutoStart, useAutoTranslate } from "../auto-translate";
import type { SubtitleMode } from "../subtitle-display";
import { SUBTITLE_SIZES, useSubtitleSize } from "../subtitle-size";
import { runTranslationLoop, type LoopStop } from "../translation-loop";
import { prepareUpload } from "../upload";
import { YoutubePlayer, useCanFullscreen, type PlayerHandle } from "./youtube-player";

export type WatchTranslation = Progress & { cues: Cue[]; sourceKind: SourceKind };

const SOURCE_LABELS: Record<SourceKind, string> = { manual: "YouTube 韓文字幕", auto: "YouTube 自動產生的韓文字幕（準確度較低）", upload: "上傳的字幕檔" };
const MODES: { id: SubtitleMode; label: string }[] = [
  { id: "zh", label: "中文" },
  { id: "both", label: "雙語" },
  { id: "ko", label: "韓文" },
];
const DOWNLOADS = [
  { lang: "zh", format: "srt", label: "中文 .srt" },
  { lang: "both", format: "srt", label: "雙語 .srt" },
  { lang: "ko", format: "srt", label: "韓文 .srt" },
  { lang: "zh", format: "vtt", label: "中文 .vtt" },
] as const;
const CONNECTION_ERROR = "連線失敗，請稍後再試";

const isActive = (status: Progress["status"] | undefined) => status === "queued" || status === "running";

type LiveUpdate = { translated?: (string | null)[]; translating: boolean };

type WatchClientProps = {
  videoId: string;
  /** 播放器下方的標題（伺服器元件，可能還在串流） */
  title: ReactNode;
  /** 標題下方頻道列的左半邊：頭像與頻道名稱 */
  channel: ReactNode;
  /** 伺服器端翻譯狀態的版本；開始、上傳、重試、重新翻譯後會換掉 */
  translationKey: string;
  translation: WatchTranslation | null;
  /** 目前的供應商還沒設定 API Key 時的提示，有金鑰時是 null；翻譯是共用的，沒有金鑰的人只能看已經翻好的部分 */
  apiKeyMissing: string | null;
  /** 能不能重新翻譯或上傳字幕：只有發起人或站長（還沒有翻譯時大家都可以） */
  canManage: boolean;
  /** 翻譯是不是觀看者自己發起的：別人發起、還沒翻完的不自動用他的 API Key 接著翻 */
  startedByViewer: boolean;
  settingsHref: string;
};

/** 照 YouTube 的觀看頁排：播放器、標題、頻道列（右邊是翻譯的膠囊按鈕），下面像說明欄的灰色區塊放翻譯進度 */
export function WatchClient({ videoId, title, channel, translationKey, translation, apiKeyMissing, canManage, startedByViewer, settingsHref }: WatchClientProps) {
  const [mode, setMode] = useState<SubtitleMode>("both");
  const [subtitleSize, setSubtitleSize] = useSubtitleSize();
  const [autoTranslate, setAutoTranslate] = useAutoTranslate();
  const canFullscreen = useCanFullscreen();
  const starter = useStartTranslation(videoId);
  const playerRef = useRef<PlayerHandle>(null);
  const playingRef = useRef(false);
  const autoAttemptedRef = useRef(false);
  // 按過「用我的 API Key 繼續翻譯」、開始或重試：這一頁之後都接著翻（面板重新掛載也記得）；記影片 id，換影片就要重新按
  const [consentedVideo, setConsentedVideo] = useState<string | null>(null);
  const consent = () => setConsentedVideo(videoId);
  const autoContinue = shouldAutoContinue({
    active: isActive(translation?.status),
    apiKeyMissing: apiKeyMissing !== null,
    startedByViewer,
    consented: consentedVideo === videoId,
  });
  // 翻譯中每批回來就更新，播放器可以先顯示已翻好的部分；伺服器端狀態換了就改用伺服器給的資料
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

  /** 只在使用者打開觀看頁播放時翻譯；同一頁只自動試一次，抓不到字幕時不會每按一次播放就重抓 */
  const autoStart = (enabled: boolean) => {
    const attempted = autoAttemptedRef.current || starter.result !== null;
    if (!shouldAutoStart({ enabled, hasTranslation: translation !== null, apiKeyMissing: apiKeyMissing !== null, attempted, pending: starter.pending })) return;
    autoAttemptedRef.current = true;
    starter.start();
  };

  const changeAutoTranslate = (on: boolean) => {
    setAutoTranslate(on);
    // 播放中才打開也算數，不必再按一次播放
    if (on && playingRef.current) autoStart(true);
  };

  // 字幕語言、大小與全螢幕：不論有沒有翻譯都放在同一排膠囊的後段
  const playerControls = (
    <>
      {translation && (
        <>
          <PillChoice label="字幕語言" icon="captions" options={MODES} value={mode} onChange={setMode} />
          <PillChoice label="字幕大小" text="大小" options={SUBTITLE_SIZES} value={subtitleSize} onChange={setSubtitleSize} />
        </>
      )}
      {canFullscreen && (
        <button type="button" onClick={() => playerRef.current?.toggleFullscreen()} className="yt-pill">
          <Icon name="tv" className="size-4" />
          全螢幕
        </button>
      )}
    </>
  );

  return (
    <div className="stack min-w-0">
      <YoutubePlayer
        ref={playerRef}
        videoId={videoId}
        cues={translation?.cues ?? []}
        translated={translated}
        mode={mode}
        subtitleSize={subtitleSize}
        translating={translating}
        onPlayingChange={(playing) => {
          playingRef.current = playing;
          if (playing) autoStart(autoTranslate);
        }}
      />
      {title}
      {translation ? (
        // 伺服器端狀態換了只重建這個面板；播放器保留，影片不會重新載入
        <TranslationPanel
          key={translationKey}
          videoId={videoId}
          channel={channel}
          controls={playerControls}
          translation={translation}
          // 播放器還沒準備好時影片也是從頭播，先從頭翻
          position={() => playerRef.current?.positionMs() ?? 0}
          apiKeyMissing={apiKeyMissing}
          canManage={canManage}
          autoContinue={autoContinue}
          onConsent={consent}
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

/** 一組互斥的選項收在同一顆膠囊裡（字幕語言、字幕大小） */
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

/** 頻道列：左邊頭像與名稱，右邊一排膠囊按鈕；手機上按鈕排成一列橫向捲動，跟 YouTube App 一樣 */
function ChannelRow({ channel, children }: { channel: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-4">
      <div className="min-w-0 flex-1 basis-48">{channel}</div>
      <div className="no-scrollbar -mx-4 flex w-[calc(100%+2rem)] items-center gap-2 overflow-x-auto px-4 sm:mx-0 sm:w-auto sm:flex-wrap sm:overflow-visible sm:px-0">
        {children}
      </div>
    </div>
  );
}

type Starter = { result: StartState | null; pending: boolean; start: () => void };

/** 按鈕與自動即時翻譯共用同一個狀態，畫面才不會同時送出兩次、訊息也只有一份 */
function useStartTranslation(videoId: string): Starter {
  const [result, setResult] = useState<StartState | null>(null);
  const [pending, startTransition] = useTransition();
  const start = () =>
    startTransition(async () => {
      try {
        setResult(await startTranslationAction(videoId));
      } catch (thrown) {
        unstable_rethrow(thrown);
        setResult({ ok: false, message: CONNECTION_ERROR, canUpload: false });
      }
    });
  return { result, pending, start };
}

function SettingsLink({ href }: { href: string }) {
  return (
    <Link href={href} className="btn-secondary btn-sm">
      <Icon name="settings" className="size-3.5" />
      前往翻譯設定
    </Link>
  );
}

function ErrorMessage({ message, needsSettings, settingsHref }: { message: string; needsSettings: boolean; settingsHref: string }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <FormMessage tone="error">{message}</FormMessage>
      {needsSettings && <SettingsLink href={settingsHref} />}
    </div>
  );
}

function UploadToggle({ open, controls, onToggle }: { open: boolean; controls: string; onToggle: () => void }) {
  return (
    <button type="button" aria-expanded={open} aria-controls={controls} onClick={onToggle} className="yt-pill">
      <Icon name="upload" className="size-4" />
      上傳字幕
    </button>
  );
}

type TranslationPanelProps = {
  videoId: string;
  channel: ReactNode;
  controls: ReactNode;
  translation: WatchTranslation;
  position: () => number;
  apiKeyMissing: string | null;
  canManage: boolean;
  /** 打開就接著翻（自己發起的，或觀看者已經按過繼續翻譯） */
  autoContinue: boolean;
  onConsent: () => void;
  settingsHref: string;
  onUpdate: (update: LiveUpdate) => void;
};

function TranslationPanel({ videoId, channel, controls, translation, position, apiKeyMissing, canManage, autoContinue, onConsent, settingsHref, onUpdate }: TranslationPanelProps) {
  const [progress, setProgress] = useState<Progress>(translation);
  const [error, setError] = useState<LoopStop | null>(null);
  // 每按一次「繼續翻譯」加一，讓自動續跑重新開始
  const [run, setRun] = useState(0);
  const [pending, startTransition] = useTransition();
  const [uploadOpen, setUploadOpen] = useState(false);
  const uploadId = useId();
  const active = isActive(progress.status);
  // 別人發起、還沒翻完：先只看已經翻好的部分，等觀看者自己決定要不要花他的錢接著翻
  const awaitingConsent = active && !autoContinue && !apiKeyMissing;

  // 連續呼叫直到完成或失敗；離開頁面就停。沒有自己的 API Key、或還沒決定要不要接著翻別人發起的翻譯，就只看已經翻好的部分
  useEffect(() => {
    if (!autoContinue) return;
    let cancelled = false;
    // 開發模式的 StrictMode 會掛載兩次：延到下一輪才開始，免得第一個迴圈的譯文被丟掉、排隊的呼叫帶著過時的播放位置
    const timer = setTimeout(() => {
      runTranslationLoop({
        call: (positionMs) => continueTranslationAction(videoId, positionMs),
        position,
        onProgress: (p) => {
          setProgress(p);
          onUpdate({ translated: p.translated, translating: isActive(p.status) });
        },
        isCancelled: () => cancelled,
      }).then((stop) => {
        if (cancelled || !stop) return;
        setError(stop);
        onUpdate({ translating: false });
      });
    }, 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onUpdate、position 每次渲染都是新函式，放進依賴會讓迴圈重啟
  }, [videoId, run, autoContinue]);

  /** 重試、重新翻譯：失敗時在面板上顯示，不丟到錯誤畫面（成功時伺服器會刷新畫面、換掉這個面板） */
  const runAction = (action: () => Promise<FormState>) =>
    startTransition(async () => {
      setError(null);
      try {
        const result = await action();
        if (result.error) setError({ message: result.error, needsSettings: false });
      } catch (thrown) {
        unstable_rethrow(thrown);
        setError({ message: CONNECTION_ERROR, needsSettings: false });
      }
    });

  const percent = progress.total ? Math.round((progress.done / progress.total) * 100) : 100;

  return (
    <>
      <ChannelRow channel={channel}>
        {awaitingConsent && (
          <button
            onClick={() => {
              onConsent();
              onUpdate({ translating: true });
            }}
            className="yt-pill yt-pill-primary"
          >
            <Icon name="play" className="size-4" />
            用我的 API Key 繼續翻譯
          </button>
        )}
        {active && error && autoContinue && (
          <button
            onClick={() => {
              setError(null);
              setRun((n) => n + 1);
              onUpdate({ translating: true });
            }}
            className="yt-pill yt-pill-primary"
          >
            <Icon name="play" className="size-4" />
            繼續翻譯
          </button>
        )}
        {progress.status === "failed" && !apiKeyMissing && (
          <button
            disabled={pending}
            onClick={() => {
              // 按重試就是決定用自己的 API Key 接著翻，重新掛載後的面板直接開始
              onConsent();
              runAction(() => retryTranslationAction(videoId));
            }}
            className="yt-pill yt-pill-primary"
          >
            <Icon name="refresh-cw" className="size-4" />
            重試
          </button>
        )}
        {controls}
        <MoreMenu
          label="下載字幕"
          triggerClassName="yt-pill"
          trigger={
            <>
              <Icon name="download" className="size-4" />
              下載
            </>
          }
        >
          {DOWNLOADS.map(({ lang, format, label }) => (
            <a key={`${lang}-${format}`} href={`/api/youtube/subtitles/${videoId}?format=${format}&lang=${lang}`} className="menu-item">
              <Icon name="download" className="size-4" />
              {label}
            </a>
          ))}
        </MoreMenu>
        {canManage && <UploadToggle open={uploadOpen} controls={uploadId} onToggle={() => setUploadOpen((open) => !open)} />}
        {canManage && !active && (
          <form action={() => runAction(() => restartTranslationAction(videoId))}>
            <ConfirmSubmitButton confirmMessage="清空目前的譯文、從頭重新翻譯？（會再花一次 API 費用）" disabled={pending} className="yt-pill">
              <Icon name="refresh-cw" className="size-4" />
              重新翻譯
            </ConfirmSubmitButton>
          </form>
        )}
      </ChannelRow>

      <section aria-label="字幕翻譯" className="yt-box stack">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 className="font-semibold text-ink">字幕翻譯</h2>
          <span className="text-sm text-muted">來源：{SOURCE_LABELS[translation.sourceKind]}</span>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <div aria-hidden className="progress-track min-w-40 flex-1">
            <div className={progress.status === "failed" ? "progress-fill progress-fill-danger" : "progress-fill"} style={{ width: `${percent}%` }} />
          </div>
          <span className="text-sm whitespace-nowrap text-ink-soft tabular-nums sm:w-44 sm:text-right">
            {progress.status === "done"
              ? `翻譯完成（${progress.total} 句）`
              : `${progress.done} / ${progress.total} 句${active ? (error ? "，已暫停" : autoContinue ? "，翻譯中…" : "，還沒翻完") : ""}`}
          </span>
        </div>
        {progress.status === "failed" && progress.error && <FormMessage tone="error">{progress.error}</FormMessage>}
        {apiKeyMissing && (active || progress.status === "failed") && (
          <div className="notice flex-wrap items-center">
            <Icon name="key-round" />
            <span className="min-w-48 flex-1">現在只能看已經翻好的部分：{apiKeyMissing}</span>
            <SettingsLink href={settingsHref} />
          </div>
        )}
        {awaitingConsent && (
          <p className="leading-relaxed">這份翻譯是其他人發起的，還沒翻完，目前顯示已經翻好的部分。要接著翻的話按「用我的 API Key 繼續翻譯」，費用由你的 API Key 支付。</p>
        )}
        {!canManage && (
          <p className="leading-relaxed">{awaitingConsent ? "" : "這份翻譯是其他人發起的，所有人共用；"}只有發起的人或站長可以重新翻譯或上傳字幕。</p>
        )}
        {error && <ErrorMessage message={error.message} needsSettings={error.needsSettings} settingsHref={settingsHref} />}
        {canManage && uploadOpen && <UploadForm id={uploadId} videoId={videoId} />}
      </section>
    </>
  );
}

type StartPanelProps = {
  videoId: string;
  channel: ReactNode;
  controls: ReactNode;
  starter: Starter;
  autoTranslate: boolean;
  onAutoTranslateChange: (on: boolean) => void;
  onConsent: () => void;
  apiKeyMissing: string | null;
  settingsHref: string;
};

function StartPanel({ videoId, channel, controls, starter: { result, pending, start }, autoTranslate, onAutoTranslateChange, onConsent, apiKeyMissing, settingsHref }: StartPanelProps) {
  const failed = result && !result.ok ? result : null;
  const canUpload = failed?.canUpload || result === null;
  // 抓不到韓文字幕而失敗時直接展開上傳；使用者自己按過就照他的選擇
  const [uploadChoice, setUploadChoice] = useState<boolean | null>(null);
  const uploadOpen = canUpload && (uploadChoice ?? result !== null);
  const uploadId = useId();

  return (
    <>
      <ChannelRow channel={channel}>
        <button
          disabled={pending}
          onClick={() => {
            // 自己按開始：抓字幕的期間別人剛好先開始了，沿用他的翻譯也照樣接著翻
            onConsent();
            start();
          }}
          className="yt-pill yt-pill-primary"
        >
          <Icon name={pending ? "loader-circle" : "sparkles"} className={pending ? "size-4 motion-safe:animate-spin" : "size-4"} />
          {pending ? "抓取字幕中…" : "開始翻譯"}
        </button>
        <label className="yt-pill cursor-pointer">
          <input type="checkbox" role="switch" checked={autoTranslate} onChange={(event) => onAutoTranslateChange(event.target.checked)} className="switch" />
          自動即時翻譯
        </label>
        {canUpload && <UploadToggle open={uploadOpen} controls={uploadId} onToggle={() => setUploadChoice(!uploadOpen)} />}
        {controls}
      </ChannelRow>

      <section aria-label="字幕翻譯" className="yt-box stack">
        <p className="leading-relaxed">
          {autoTranslate ? "還沒翻譯。按下播放就會抓韓文字幕，一邊播一邊用 AI 翻成中文。" : "還沒翻譯。按「開始翻譯」才會抓韓文字幕並用 AI 翻成中文。"}
        </p>
        {apiKeyMissing && !failed && (
          <div className="notice flex-wrap items-center">
            <Icon name="key-round" />
            <span className="min-w-48 flex-1">{apiKeyMissing}</span>
            <SettingsLink href={settingsHref} />
          </div>
        )}
        {failed && <ErrorMessage message={failed.message} needsSettings={"needsSettings" in failed && failed.needsSettings === true} settingsHref={settingsHref} />}
        {uploadOpen && <UploadForm id={uploadId} videoId={videoId} />}
      </section>
    </>
  );
}

function UploadForm({ id, videoId }: { id: string; videoId: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(async (previous, formData) => {
    const prepared = await prepareUpload(formData);
    if ("error" in prepared) return prepared;
    try {
      return await uploadSubtitlesAction(previous, prepared.formData);
    } catch (thrown) {
      // 例如斷線或伺服器拒收：留在表單上顯示，不讓整頁變成錯誤畫面
      unstable_rethrow(thrown);
      return { error: "上傳失敗（連線中斷或伺服器拒收），請再試一次" };
    }
  }, {});
  return (
    <form id={id} action={action} className="stack border-t border-line pt-4">
      <input type="hidden" name="videoId" value={videoId} />
      <p className="leading-relaxed text-ink-soft">
        上傳自己的韓文字幕檔（.srt／.vtt），會取代目前的字幕並從頭翻譯。可以用 <code>yt-dlp --write-subs --write-auto-subs --sub-langs ko --skip-download 影片網址</code> 下載。
      </p>
      <div className="flex flex-wrap gap-2">
        <input type="file" name="file" accept=".srt,.vtt,text/vtt,application/x-subrip" required className="input min-w-0 flex-1 basis-56 text-sm" />
        <button disabled={pending} className="btn-secondary">
          <Icon name="upload" className="size-4" />
          {pending ? "上傳中…" : "上傳並翻譯"}
        </button>
      </div>
      {!pending && <FormFeedback state={state} />}
    </form>
  );
}
