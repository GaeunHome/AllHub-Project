import type { ReactNode } from "react";
import { Icon, type UiIconName } from "./icon";

type EmptyStateProps = {
  icon?: UiIconName;
  title: ReactNode;
  hint?: ReactNode;
  /** 下一步的按鈕或連結 例如去追蹤主播 */
  action?: ReactNode;
  /** 卡片裡用的橫向小版 排成一列不佔一大塊 */
  compact?: boolean;
};

export function EmptyState({ icon = "flower-2", title, hint, action, compact = false }: EmptyStateProps) {
  if (compact) {
    return (
      <div className="empty-state-compact">
        {/* 跟按鈕一樣高 有沒有按鈕並排的兩個空狀態都一樣高 */}
        <span className="icon-tile size-11 rounded-xl">
          <Icon name={icon} />
        </span>
        {/* 基準是 0 時按鈕永遠不換行 文字會擠成一字一行
            太大的話半張卡片放不下 文字會掉到圖示下面 */}
        <div className="flex min-w-0 flex-[1_1_7.5rem] flex-col gap-0.5">
          <p className="font-semibold text-ink">{title}</p>
          {hint && <p className="text-sm text-ink">{hint}</p>}
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
        {hint && <p className="max-w-sm text-sm text-ink">{hint}</p>}
      </div>
      {action}
    </div>
  );
}
