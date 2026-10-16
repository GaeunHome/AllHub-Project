import type { CSSProperties } from "react";

export type IllustrationName = "setup" | "no-accounts" | "no-holdings" | "no-recurring" | "all-done";

// 跟 public/illustrations/finance 裡各檔案的 viewBox 一樣
const VIEW_BOXES: Record<IllustrationName, string> = {
  setup: "0 0 960 604",
  "no-accounts": "0 0 799.465 552.326",
  "no-holdings": "0 0 800 595.193",
  "no-recurring": "0 0 800.838 779.08",
  "all-done": "0 0 960 747.646",
};

/**
 * 只是裝飾 意思寫在旁邊的字 寬度由 className 決定 沒給是 w-40
 * 圖放在靜態檔用 use 引用 顏色吃 globals.css 的變數 深色模式跟著換
 */
export function Illustration({ name, className = "w-40" }: { name: IllustrationName; className?: string }) {
  const [, , width, height] = VIEW_BOXES[name].split(" ");
  return (
    <svg aria-hidden="true" focusable="false" viewBox={VIEW_BOXES[name]} style={{ aspectRatio: `${width} / ${height}` } as CSSProperties} className={`fin-illustration ${className}`}>
      <use href={`/illustrations/finance/${name}.svg#art`} />
    </svg>
  );
}
