"use client";

import Link from "next/link";
import { unstable_rethrow } from "next/navigation";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { ConfirmSubmitButton } from "@/core/ui/confirm-submit-button";
import { FormFeedback, FormMessage } from "@/core/ui/form-message";
import { Icon } from "@/core/ui/icon";
import { SegmentedControl } from "@/core/ui/segmented-control";
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
import { shouldAutoStart, useAutoTranslate } from "../auto-translate";
import type { SubtitleMode } from "../subtitle-display";
import { SUBTITLE_SIZES, useSubtitleSize } from "../subtitle-size";
import { runTranslationLoop, type LoopStop } from "../translation-loop";
import { prepareUpload } from "../upload";
import { YoutubePlayer, type PlayerHandle } from "./youtube-player";

export type WatchTranslation = Progress & { cues: Cue[]; sourceKind: SourceKind };

const SOURCE_LABELS: Record<SourceKind, string> = { manual: "YouTube 韓文字幕", auto: "YouTube 自動產生的韓文字幕（準確度較低）", upload: "上傳的字幕檔" };
const MODES: { id: SubtitleMode; label: string }[] = [
  { id: "zh", label: "中文" },
  { id: "both", label: "雙語" },
  { id: "ko", label: "韓文" },
];
const CONNECTION_ERROR = "連線失敗，請稍後再試";

const isActive = (status: Progress["status"] | undefined) => status === "queued" || status === "running";

type LiveUpdate = { translated?: (string | null)[]; translating: boolean };

type WatchClientProps = {
  videoId: string;
  /** 伺服器端翻譯狀態的版本；開始、上傳、重試、重新翻譯後會換掉 */
  translationKey: string;
  translation: WatchTranslation | null;
  /** 目前的供應商還沒設定 API Key 時的提示，有金鑰時是 null */
  apiKeyMissing: string | null;
  settingsHref: string;
};

export function WatchClient({ videoId, translationKey, translation, apiKeyMissing, settingsHref }: WatchClientProps) {
  const [mode, setMode] = useState<SubtitleMode>("both");
  const [subtitleSize, setSubtitleSize] = useSubtitleSize();
  const [autoTranslate, setAutoTranslate] = useAutoTranslate();
  const starter = useStartTranslation(videoId);
  const playerRef = useRef<PlayerHandle>(null);
  const playingRef = useRef(false);
  const autoAttemptedRef = useRef(false);
  // 翻譯中每批回來就更新，播放器可以先顯示已翻好的部分；伺服器端狀態換了就改用伺服器給的資料
  const [live, setLive] = useState<{ key: string; translated: (string | null)[]; translating: boolean } | null>(null);
  const current = live?.key === translationKey ? live : null;
  const translated = current?.translated ?? translation?.translated ?? [];
  const translating = current?.translating ?? isActive(translation?.status);

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

  return (
    <div className="flex flex-col gap-5">
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
        toolbar={
          translation && (
            <>
              <SegmentedControl label="字幕" options={MODES} value={mode} onChange={setMode} />
              <SegmentedControl label="大小" options={SUBTITLE_SIZES} value={subtitleSize} onChange={setSubtitleSize} />
            </>
          )
        }
      />
      {translation ? (
        // 伺服器端狀態換了只重建這個面板；播放器保留，影片不會重新載入
        <TranslationPanel
          key={translationKey}
          videoId={videoId}
          translation={translation}
          // 播放器還沒準備好時影片也是從頭播，先從頭翻
          position={() => playerRef.current?.positionMs() ?? 0}
          settingsHref={settingsHref}
          onUpdate={report}
        />
      ) : (
        <StartPanel
          videoId={videoId}
          starter={starter}
          autoTranslate={autoTranslate}
          onAutoTranslateChange={changeAutoTranslate}
          apiKeyMissing={apiKeyMissing}
          settingsHref={settingsHref}
        />
      )}
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

type TranslationPanelProps = {
  videoId: string;
  translation: WatchTranslation;
  position: () => number;
  settingsHref: string;
  onUpdate: (update: LiveUpdate) => void;
};

function TranslationPanel({ videoId, translation, position, settingsHref, onUpdate }: TranslationPanelProps) {
  const [progress, setProgress] = useState<Progress>(translation);
  const [error, setError] = useState<LoopStop | null>(null);
  // 每按一次「繼續翻譯」加一，讓自動續跑重新開始
  const [run, setRun] = useState(0);
  const [pending, startTransition] = useTransition();
  const active = isActive(progress.status);

  // 連續呼叫直到完成或失敗；離開頁面就停
  useEffect(() => {
    if (!isActive(translation.status)) return;
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
  }, [videoId, translation.status, run]);

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
    <section className="card flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="flex items-center gap-2 font-semibold text-ink">
          <Icon name="captions" className="size-5 text-accent" />
          字幕翻譯
        </h2>
        <span className="chip chip-accent ml-auto max-w-full truncate">來源：{SOURCE_LABELS[translation.sourceKind]}</span>
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <div aria-hidden className="progress-track min-w-40 flex-1">
            <div className={progress.status === "failed" ? "progress-fill progress-fill-danger" : "progress-fill"} style={{ width: `${percent}%` }} />
          </div>
          <span className="text-sm whitespace-nowrap text-muted tabular-nums sm:w-44 sm:text-right">
            {progress.status === "done" ? `翻譯完成（${progress.total} 句）` : `${progress.done} / ${progress.total} 句${active ? (error ? "，已暫停" : "，翻譯中…") : ""}`}
          </span>
        </div>
        {/* 進度不是從頭往後長，先說明，免得以為卡住或漏翻 */}
        {active && !error && <p className="text-xs text-muted">從目前的播放位置往後優先翻，前方翻好後再從頭補完整支影片。</p>}
      </div>

      {progress.status === "failed" && progress.error && <FormMessage tone="error">{progress.error}</FormMessage>}
      {error && <ErrorMessage message={error.message} needsSettings={error.needsSettings} settingsHref={settingsHref} />}

      <div className="flex flex-wrap items-center gap-2">
        {active && error && (
          <button
            onClick={() => {
              setError(null);
              setRun((n) => n + 1);
              onUpdate({ translating: true });
            }}
            className="btn-primary btn-sm"
          >
            <Icon name="play" className="size-3.5" />
            繼續翻譯
          </button>
        )}
        {progress.status === "failed" && (
          <button disabled={pending} onClick={() => runAction(() => retryTranslationAction(videoId))} className="btn-primary btn-sm">
            <Icon name="refresh-cw" className="size-3.5" />
            重試
          </button>
        )}
        {!active && (
          <form action={() => runAction(() => restartTranslationAction(videoId))}>
            <ConfirmSubmitButton confirmMessage="清空目前的譯文、從頭重新翻譯？（會再花一次 API 費用）" disabled={pending} className="btn-secondary btn-sm">
              <Icon name="refresh-cw" className="size-3.5" />
              重新翻譯
            </ConfirmSubmitButton>
          </form>
        )}
        <div className="flex flex-wrap items-center gap-1.5 text-sm sm:ml-auto">
          <span className="text-muted">下載：</span>
          {(["zh", "both", "ko"] as const).map((lang) => (
            <a key={lang} href={`/api/youtube/subtitles/${videoId}?format=srt&lang=${lang}`} className="chip chip-accent hover:border-accent">
              <Icon name="download" className="size-3" />
              {lang === "zh" ? "中文" : lang === "both" ? "雙語" : "韓文"} .srt
            </a>
          ))}
          <a href={`/api/youtube/subtitles/${videoId}?format=vtt&lang=zh`} className="chip chip-accent hover:border-accent">
            <Icon name="download" className="size-3" />
            中文 .vtt
          </a>
        </div>
      </div>

      <details className="disclosure text-sm">
        <summary>
          <Icon name="upload" className="size-4" />
          改用自己的字幕檔
        </summary>
        <div className="mt-3">
          <UploadForm videoId={videoId} />
        </div>
      </details>
    </section>
  );
}

type StartPanelProps = {
  videoId: string;
  starter: Starter;
  autoTranslate: boolean;
  onAutoTranslateChange: (on: boolean) => void;
  apiKeyMissing: string | null;
  settingsHref: string;
};

function StartPanel({ videoId, starter: { result, pending, start }, autoTranslate, onAutoTranslateChange, apiKeyMissing, settingsHref }: StartPanelProps) {
  const failed = result && !result.ok ? result : null;

  return (
    <section className="card flex flex-col gap-4">
      <div className="flex items-start gap-3">
        <span className="icon-tile size-11 rounded-2xl">
          <Icon name="languages" />
        </span>
        <p className="text-sm leading-relaxed text-muted">
          {autoTranslate
            ? "這支影片還沒翻譯。按下播放就會自動抓 YouTube 上的韓文字幕，一邊播放一邊用 AI 翻成中文（會使用你設定的 API Key）。"
            : "這支影片還沒翻譯。按「開始翻譯」才會抓 YouTube 上的韓文字幕並用 AI 翻成中文（會使用你設定的 API Key）。"}
        </p>
      </div>
      {apiKeyMissing && !failed && (
        <div className="notice flex-wrap items-center">
          <Icon name="key-round" />
          <span className="min-w-48 flex-1">{apiKeyMissing}</span>
          <SettingsLink href={settingsHref} />
        </div>
      )}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
        <button disabled={pending} onClick={start} className="btn-primary">
          <Icon name={pending ? "loader-circle" : "sparkles"} className={pending ? "size-4 motion-safe:animate-spin" : "size-4"} />
          {pending ? "抓取字幕中…" : "開始翻譯"}
        </button>
        <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-ink-soft">
          <input type="checkbox" role="switch" checked={autoTranslate} onChange={(event) => onAutoTranslateChange(event.target.checked)} className="size-4" />
          自動即時翻譯
          <span className="font-normal text-muted">（按下播放就開始）</span>
        </label>
      </div>
      {failed && <ErrorMessage message={failed.message} needsSettings={"needsSettings" in failed && failed.needsSettings === true} settingsHref={settingsHref} />}
      {failed?.canUpload || result === null ? (
        <details open={!!result} className="disclosure text-sm">
          <summary>
            <Icon name="upload" className="size-4" />
            或上傳自己的韓文字幕檔（.srt／.vtt）
          </summary>
          <div className="mt-3">
            <UploadForm videoId={videoId} />
          </div>
        </details>
      ) : null}
    </section>
  );
}

function UploadForm({ videoId }: { videoId: string }) {
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
    <form action={action} className="flex flex-col gap-3 rounded-2xl bg-surface-muted p-4">
      <input type="hidden" name="videoId" value={videoId} />
      <p className="leading-relaxed text-muted">
        可以用 <code>yt-dlp --write-subs --write-auto-subs --sub-langs ko --skip-download 影片網址</code> 下載。上傳後會取代目前的字幕並從頭翻譯。
      </p>
      <div className="flex flex-wrap gap-2">
        <input type="file" name="file" accept=".srt,.vtt,text/vtt,application/x-subrip" required className="input min-w-56 flex-1 text-sm" />
        <button disabled={pending} className="btn-secondary">
          <Icon name="upload" className="size-4" />
          {pending ? "上傳中…" : "上傳並翻譯"}
        </button>
      </div>
      {!pending && <FormFeedback state={state} />}
    </form>
  );
}
