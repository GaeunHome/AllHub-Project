"use client";

import { unstable_rethrow } from "next/navigation";
import { useId, useState, useTransition, type ReactNode } from "react";
import { ConfirmSubmitButton } from "@/core/ui/confirm-submit-button";
import { FormMessage, type FormState } from "@/core/ui/form-message";
import { Icon } from "@/core/ui/icon";
import { restartTranslationAction, retryTranslationAction } from "../actions";
import type { SourceKind } from "../../data/schema";
import type { Cue } from "../../lib/subtitles/format";
import type { Progress } from "../../service/translation";
import { createJoinFlag } from "../join-translation";
import type { LoopStop } from "../translation-loop";
import { useContinueTranslation } from "../use-continue-translation";
import { SubtitleDownloadMenu } from "./subtitle-download-menu";
import { UploadForm, UploadToggle } from "./upload-form";
import { ApiKeyNotice, CONNECTION_ERROR, ChannelRow, ErrorMessage, isActive, type LiveUpdate } from "./watch-panel-parts";

export type WatchTranslation = Progress & { cues: Cue[]; sourceKind: SourceKind };

const SOURCE_LABELS: Record<SourceKind, string> = { manual: "YouTube 韓文字幕", auto: "YouTube 自動產生的韓文字幕（準確度較低）", upload: "上傳的字幕檔" };

type TranslationPanelProps = {
  videoId: string;
  channel: ReactNode;
  controls: ReactNode;
  translation: WatchTranslation;
  position: () => number;
  apiKeyMissing: string | null;
  canManage: boolean;
  /** 打開就接著翻 自己發起的或觀看者已經按過繼續翻譯 */
  autoContinue: boolean;
  onConsent: () => void;
  /** 續翻的回應說伺服器把影片加進了保留清單 */
  onSaved: () => void;
  settingsHref: string;
  onUpdate: (update: LiveUpdate) => void;
};

export function TranslationPanel({ videoId, channel, controls, translation, position, apiKeyMissing, canManage, autoContinue, onConsent, onSaved, settingsHref, onUpdate }: TranslationPanelProps) {
  const [progress, setProgress] = useState<Progress>(translation);
  const [error, setError] = useState<LoopStop | null>(null);
  // 每按一次繼續翻譯加一 讓自動續跑重新開始
  const [run, setRun] = useState(0);
  // 按了用我的 API Key 繼續翻譯後 續翻成功時伺服器才把影片加進保留清單
  const [join] = useState(() => createJoinFlag(onSaved));
  const [pending, startTransition] = useTransition();
  const [uploadOpen, setUploadOpen] = useState(false);
  const uploadId = useId();
  const active = isActive(progress.status);
  // 別人發起又還沒翻完 先只看翻好的部分 等觀看者自己決定要不要花錢接著翻
  const awaitingConsent = active && !autoContinue && !apiKeyMissing;

  useContinueTranslation({
    videoId,
    autoContinue,
    run,
    join,
    position,
    onProgress: (p) => {
      setProgress(p);
      onUpdate({ translated: p.translated, translating: isActive(p.status) });
    },
    onStop: (stop) => {
      setError(stop);
      onUpdate({ translating: false });
    },
  });

  /** 重試與重新翻譯失敗時顯示在面板上 不丟到錯誤畫面 成功時伺服器會換掉這個面板 */
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

  return (
    <>
      <ChannelRow channel={channel}>
        {awaitingConsent && (
          <button
            onClick={() => {
              join.raise();
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
              // 按重試就是決定用自己的 API Key 接著翻 重新掛載後的面板直接開始
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
        <SubtitleDownloadMenu videoId={videoId} />
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

      <TranslationStatus
        progress={progress}
        sourceKind={translation.sourceKind}
        error={error}
        apiKeyMissing={apiKeyMissing}
        awaitingConsent={awaitingConsent}
        autoContinue={autoContinue}
        canManage={canManage}
        settingsHref={settingsHref}
      >
        {canManage && uploadOpen && <UploadForm id={uploadId} videoId={videoId} />}
      </TranslationStatus>
    </>
  );
}

type TranslationStatusProps = {
  progress: Progress;
  sourceKind: SourceKind;
  error: LoopStop | null;
  apiKeyMissing: string | null;
  awaitingConsent: boolean;
  autoContinue: boolean;
  canManage: boolean;
  settingsHref: string;
  /** 上傳字幕的表單 打開時放在最下面 */
  children: ReactNode;
};

/** 字幕翻譯的進度條 來源與要讓觀看者知道的說明 */
function TranslationStatus({ progress, sourceKind, error, apiKeyMissing, awaitingConsent, autoContinue, canManage, settingsHref, children }: TranslationStatusProps) {
  const active = isActive(progress.status);
  const percent = progress.total ? Math.round((progress.done / progress.total) * 100) : 100;
  return (
    <section aria-label="字幕翻譯" className="yt-box stack">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="font-semibold text-ink">字幕翻譯</h2>
        <span className="text-sm text-ink-soft">來源：{SOURCE_LABELS[sourceKind]}</span>
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
      {apiKeyMissing && (active || progress.status === "failed") && <ApiKeyNotice settingsHref={settingsHref}>現在只能看已經翻好的部分：{apiKeyMissing}</ApiKeyNotice>}
      {awaitingConsent && (
        <p className="leading-relaxed">這份翻譯是其他人發起的，還沒翻完，目前顯示已經翻好的部分。要接著翻的話按「用我的 API Key 繼續翻譯」，費用由你的 API Key 支付。</p>
      )}
      {!canManage && (
        <p className="leading-relaxed">{awaitingConsent ? "" : "這份翻譯是其他人發起的，所有人共用；"}只有發起的人或站長可以重新翻譯或上傳字幕。</p>
      )}
      {error && <ErrorMessage message={error.message} needsSettings={error.needsSettings} settingsHref={settingsHref} />}
      {children}
    </section>
  );
}
