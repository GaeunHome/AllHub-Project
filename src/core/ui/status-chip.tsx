import { Icon, type UiIconName } from "./icon";

export type StatusTone = "success" | "warning" | "danger";

/** 狀態用顏色加圖示加文字的標籤 色盲也看得懂 */
export type StatusBadge = { label: string; tone: StatusTone; detail: string | null };

const TONES: Record<StatusTone, { chip: string; icon: UiIconName }> = {
  success: { chip: "chip chip-success", icon: "circle-check" },
  warning: { chip: "chip chip-warning", icon: "clock" },
  danger: { chip: "chip chip-danger", icon: "circle-alert" },
};

export function StatusChip({ badge, className = "" }: { badge: Pick<StatusBadge, "label" | "tone">; className?: string }) {
  const tone = TONES[badge.tone];
  return (
    <span className={`${tone.chip} ${className}`}>
      <Icon name={tone.icon} className="size-3.5" />
      {badge.label}
    </span>
  );
}
