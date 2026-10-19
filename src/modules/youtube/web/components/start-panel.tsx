"use client";

import { unstable_rethrow } from "next/navigation";
import { useId, useState, useTransition, type ReactNode } from "react";
import { Icon } from "@/core/ui/icon";
import { startTranslationAction, type StartState } from "../actions";
import { UploadForm, UploadToggle } from "./upload-form";
import { ApiKeyNotice, CONNECTION_ERROR, ChannelRow, ErrorMessage } from "./watch-panel-parts";

export type Starter = { result: StartState | null; pending: boolean; start: () => void };

/** 按鈕與自動即時翻譯共用同一個狀態 才不會同時送出兩次 訊息也只有一份 */
export function useStartTranslation(videoId: string): Starter {
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

export function StartPanel({ videoId, channel, controls, starter: { result, pending, start }, autoTranslate, onAutoTranslateChange, onConsent, apiKeyMissing, settingsHref }: StartPanelProps) {
  const failed = result && !result.ok ? result : null;
  const canUpload = failed?.canUpload || result === null;
  // 抓不到韓文字幕時直接展開上傳 使用者自己按過就照他的選擇
  const [uploadChoice, setUploadChoice] = useState<boolean | null>(null);
  const uploadOpen = canUpload && (uploadChoice ?? result !== null);
  const uploadId = useId();

  return (
    <>
      <ChannelRow channel={channel}>
        <button
          disabled={pending}
          onClick={() => {
            // 自己按開始時 抓字幕期間別人剛好先開始了 沿用他的翻譯也照樣接著翻
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
        {apiKeyMissing && !failed && <ApiKeyNotice settingsHref={settingsHref}>{apiKeyMissing}</ApiKeyNotice>}
        {failed && <ErrorMessage message={failed.message} needsSettings={"needsSettings" in failed && failed.needsSettings === true} settingsHref={settingsHref} />}
        {uploadOpen && <UploadForm id={uploadId} videoId={videoId} />}
      </section>
    </>
  );
}

