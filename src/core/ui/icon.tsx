import type { CSSProperties } from "react";

/** 列出檔名讓 TypeScript 擋下打錯的名稱：mask 載入失敗不會報錯，只會默默不顯示 */
export const UI_ICON_NAMES = [
  "arrow-down",
  "arrow-up",
  "battery-charging",
  "bell",
  "bell-off",
  "bell-ring",
  "calendar",
  "calendar-check",
  "captions",
  "chart-column",
  "check",
  "check-check",
  "chevron-down",
  "chevron-left",
  "chevron-right",
  "circle-alert",
  "circle-check",
  "circle-user-round",
  "clapperboard",
  "clock",
  "coins",
  "copy",
  "download",
  "ellipsis-vertical",
  "external-link",
  "eye",
  "eye-off",
  "flower-2",
  "gamepad-2",
  "heart",
  "house",
  "inbox",
  "info",
  "key-round",
  "languages",
  "link",
  "list-video",
  "loader-circle",
  "lock",
  "log-out",
  "monitor",
  "moon",
  "pencil",
  "piggy-bank",
  "play",
  "plus",
  "radio",
  "refresh-cw",
  "search",
  "settings",
  "shield-check",
  "sparkles",
  "star",
  "sun",
  "target",
  "train-front",
  "trash-2",
  "tv",
  "upload",
  "users",
  "volume-2",
  "volume-x",
  "wallet",
  "x",
  "zap",
] as const;

export type UiIconName = (typeof UI_ICON_NAMES)[number];

type IconSource = { name: UiIconName; src?: never } | { src: `/${string}.svg`; name?: never };

type IconProps = IconSource & {
  className?: string;
  /** 只有圖示本身帶意義（旁邊沒有文字）時才給，否則當裝飾讓報讀器略過 */
  label?: string;
};

// 圖示維持 public/ 裡的靜態檔，用 CSS mask 套上 currentColor，才能跟著主題與點綴色變色
export function Icon({ name, src, className, label }: IconProps) {
  const url = src ?? `/icons/ui/${name}.svg`;
  return (
    <span
      className={className ? `icon ${className}` : "icon"}
      style={{ "--icon-url": `url("${url}")` } as CSSProperties}
      {...(label ? { role: "img", "aria-label": label } : { "aria-hidden": true })}
    />
  );
}
