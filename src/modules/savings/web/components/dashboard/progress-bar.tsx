import type { CSSProperties } from "react";

/** warning 與 danger 只給預算用 旁邊一定有圖示與文字 不只靠顏色 */
export type ProgressTone = "accent" | "warning" | "danger";

type ProgressBarProps = {
  percent: number;
  tone?: ProgressTone;
  /** 達到目標時長滿後亮一下 只播一次 見 globals.css 的 fin-glow */
  reached?: boolean;
  /** 同一區的第幾條 進場時依序錯開 */
  index?: number;
};

/** 數字另外寫成文字 進度條只是畫面 動畫見 globals.css 的 fin-grow-x */
export function ProgressBar({ percent, tone = "accent", reached = false, index = 0 }: ProgressBarProps) {
  const width = Math.min(100, Math.max(0, percent));
  return (
    <div aria-hidden="true" className="fin-progress">
      <div className="fin-progress-fill" data-tone={tone} data-reached={reached ? "" : undefined} style={{ width: `${width}%`, "--i": index } as CSSProperties} />
    </div>
  );
}
