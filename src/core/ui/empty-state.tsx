import type { ReactNode } from "react";
import { Icon, type UiIconName } from "./icon";

type EmptyStateProps = {
  icon?: UiIconName;
  title: ReactNode;
  hint?: ReactNode;
  /** 下一步的按鈕或連結，例如「去追蹤主播」 */
  action?: ReactNode;
  /** 卡片裡用的橫向小版：圖示、文字、按鈕排成一列，不佔一大塊 */
  compact?: boolean;
};

export function EmptyState({ icon = "flower-2", title, hint, action, compact = false }: EmptyStateProps) {
  if (compact) {
    return (
      <div className="empty-state-compact">
        {/* 跟按鈕一樣高：有沒有按鈕，並排的兩個空狀態都一樣高 */}
        <span className="icon-tile size-11 rounded-xl">
          <Icon name={icon} />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <p className="font-semibold text-ink">{title}</p>
          {hint && <p className="text-sm text-ink-soft">{hint}</p>}
        </div>
        {action}
      </div>
    );
  }

  return (
    <div className="empty-state">
      <span className="icon-tile size-12 rounded-full">
        <Icon name={icon} />
      </span>
      <div className="flex flex-col items-center gap-1">
        <p className="font-semibold text-ink">{title}</p>
        {hint && <p className="max-w-sm text-sm text-ink-soft">{hint}</p>}
      </div>
      {action}
    </div>
  );
}
