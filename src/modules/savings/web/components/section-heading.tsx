import type { ReactNode } from "react";
import { SectionTitle } from "@/core/ui/page-header";
import { formatTwd } from "../../lib/money";

/** 一區卡片上面的標題 右邊放這一區的合計 */
export function SectionHeading({ id, title, summary }: { id: string; title: ReactNode; summary?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
      <SectionTitle id={id}>{title}</SectionTitle>
      {summary}
    </div>
  );
}

export function Sum({ label, amount }: { label: string; amount: number }) {
  return (
    <p className="text-ink-soft">
      {label} <span className="font-semibold text-ink tabular-nums">{formatTwd(amount)}</span>
    </p>
  );
}
