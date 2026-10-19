import type { ReactNode } from "react";
import { LoadingState, Skeleton } from "./skeleton";

/**
 * 首頁影音卡片的格線 依卡片寬度用容器查詢 不看螢幕寬度
 * 寬的一排四個 中等兩個 很窄時一列一個 小縮圖在左
 */
export const MEDIA_GRID = "grid grid-cols-1 gap-4 @md:grid-cols-2 @4xl:grid-cols-4";

/** 跟 MEDIA_GRID 同一套排法的骨架 縮圖旁邊放 children 窄的時候只放兩個 載入完才不會跳動 */
export function MediaGridSkeleton({ label, children }: { label: string; children: ReactNode }) {
  return (
    <LoadingState label={label} className={MEDIA_GRID}>
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className={`flex items-start gap-3 @md:flex-col @md:items-stretch ${i > 1 ? "hidden @4xl:flex" : ""}`}>
          <Skeleton className="aspect-video w-32 shrink-0 rounded-lg @md:w-full" />
          {children}
        </div>
      ))}
    </LoadingState>
  );
}
