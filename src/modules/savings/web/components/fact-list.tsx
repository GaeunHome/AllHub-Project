import type { ReactNode } from "react";

/** 標籤在左 值在右 首頁卡片與紀錄共用 */
export function FactList({ className = "", children }: { className?: string; children: ReactNode }) {
  return <dl className={`flex flex-col divide-y divide-line ${className}`}>{children}</dl>;
}

export function Fact({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="flex min-h-11 flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2">
      <dt className="text-ink-soft">{label}</dt>
      {/* 放不下時在右邊換行 不掉到標籤底下 */}
      <dd className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-x-2 gap-y-1 text-right text-ink tabular-nums">{children}</dd>
    </div>
  );
}
