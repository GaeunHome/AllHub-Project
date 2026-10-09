import type { ModuleInfo } from "../module";
import { Icon } from "../ui/icon";
import type { NotificationItem } from "./types";

/** 通知只需要模組的名稱、圖示與點綴色（導覽列另外帶 href）；由 src/app 從模組清單傳進來，core 不 import 模組 */
export type NotificationModule = Pick<ModuleInfo, "id" | "name" | "icon" | "accent" | "notifies"> & Partial<Pick<ModuleInfo, "href">>;

export function ModuleBadge({ module, className = "size-9" }: { module?: NotificationModule; className?: string }) {
  return (
    <span data-accent={module?.accent} className={`icon-tile shrink-0 rounded-xl ${className}`}>
      {module?.icon ? <Icon src={module.icon} /> : <Icon name="bell" />}
    </span>
  );
}

/** 鈴鐺面板與提示卡片共用的內容；時間由呼叫端算好傳進來 */
export function NotificationSummary({ item, module, time }: { item: NotificationItem; module?: NotificationModule; time: string }) {
  return (
    <>
      {/* 未讀的點放在模組圖示的角落，跟通知頁一樣；標題都從同一條線開始 */}
      <span className="relative shrink-0">
        <ModuleBadge module={module} />
        {!item.read && <span aria-hidden className="unread-dot absolute -top-1 -right-1 ring-2 ring-[var(--surface-solid)]" />}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className={`truncate text-sm ${item.read ? "text-ink-soft" : "font-semibold text-ink"}`}>
          {item.title}
          {!item.read && <span className="sr-only">（未讀）</span>}
        </span>
        {item.body && <span className="line-clamp-2 text-[0.8125rem] leading-relaxed whitespace-pre-line text-ink-soft">{item.body}</span>}
        <span className="text-xs text-muted">
          {module?.name ?? item.module} · {time}
        </span>
      </span>
    </>
  );
}
