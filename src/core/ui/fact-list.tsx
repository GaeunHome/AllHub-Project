import type { ReactNode } from "react";

/** 標籤在左 值在右 一列一項 列與列之間有分隔線 */
export function FactList({ className, children }: { className?: string; children: ReactNode }) {
  return <dl className={className ? `flex flex-col divide-y divide-line ${className}` : "flex flex-col divide-y divide-line"}>{children}</dl>;
}

const LAYOUTS = {
  // 值放不下時在右邊換行 不掉到標籤底下 數字等寬
  wrap: {
    row: "flex min-h-11 flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2",
    term: "text-ink-soft",
    detail: "flex min-w-0 flex-1 flex-wrap items-center justify-end gap-x-2 gap-y-1 text-right text-ink tabular-nums",
  },
  // 一列到底 標籤不縮 太長的值自己截斷
  line: { row: "flex min-h-11 items-center justify-between gap-3 py-2", term: "shrink-0 text-ink-soft", detail: "flex min-w-0 items-center justify-end gap-3 text-right text-ink" },
};

/** className 加在那一列上 例如接在其他內容下面時第一列不留上方的內距 */
export function Fact({ label, layout = "wrap", className, children }: { label: ReactNode; layout?: keyof typeof LAYOUTS; className?: string; children: ReactNode }) {
  const style = LAYOUTS[layout];
  return (
    <div className={className ? `${style.row} ${className}` : style.row}>
      <dt className={style.term}>{label}</dt>
      <dd className={style.detail}>{children}</dd>
    </div>
  );
}
