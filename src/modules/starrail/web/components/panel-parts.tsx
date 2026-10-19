import type { ReactNode } from "react";

/** 骨架的標題列 HoYoLAB 回應要等幾秒 除了骨架也寫出正在做什麼 */
export function LoadingTitle({ title }: { title: string }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
      <h3 className="sr-title">{title}</h3>
      <span aria-hidden className="text-sm text-ink-soft">
        向 HoYoLAB 查詢中…
      </span>
    </div>
  );
}

/**
 * 讀不到或沒有資料時只在這一塊說明 tall 時標題列跟有切換鈕時一樣高
 * 並排的另一塊標題才對得齊
 */
export function PanelNotice({ title, tall = false, children }: { title: string; tall?: boolean; children: ReactNode }) {
  return (
    <section className="stack">
      <h3 className={tall ? "sr-title min-h-11" : "sr-title"}>{title}</h3>
      {children}
    </section>
  );
}
