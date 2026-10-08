import type { ReactNode } from "react";

export type StatusTone = "success" | "warning" | "danger";

const DOT_CLASS: Record<StatusTone, string> = {
  success: "status-dot status-dot-success",
  warning: "status-dot status-dot-warning",
  danger: "status-dot status-dot-danger",
};

// 狀態除了顏色還有文字，色盲也看得懂；只有失敗時文字才跟著變色，避免畫面太花
export function StatusText({ tone, title, children }: { tone: StatusTone; title?: string; children: ReactNode }) {
  return (
    <p className={`flex min-w-0 items-center gap-1.5 text-xs ${tone === "danger" ? "text-danger" : "text-muted"}`} title={title}>
      <span className={DOT_CLASS[tone]} aria-hidden />
      <span className="truncate">{children}</span>
    </p>
  );
}
