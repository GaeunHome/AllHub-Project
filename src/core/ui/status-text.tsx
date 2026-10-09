import type { ReactNode } from "react";
import { Icon } from "./icon";
import type { StatusTone } from "./status-chip";

export type { StatusTone } from "./status-chip";

const CHIP: Record<StatusTone, string> = {
  success: "chip chip-success",
  warning: "chip chip-warning",
  danger: "chip chip-danger",
};

// 狀態用標籤顯示（顏色加圖示加文字），不用灰色小字；長的內容截斷，完整內容放在 title
export function StatusText({ tone, title, children }: { tone: StatusTone; title?: string; children: ReactNode }) {
  return (
    <span className={`${CHIP[tone]} max-w-full self-start`} title={title}>
      <Icon name={tone === "success" ? "circle-check" : tone === "warning" ? "clock" : "circle-alert"} className="size-3.5" />
      <span className="truncate">{children}</span>
    </span>
  );
}
