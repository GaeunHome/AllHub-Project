import { Suspense, type ReactNode } from "react";
import type { ModuleInfo } from "@/core/module";
import { CardErrorBoundary } from "@/core/ui/card-error-boundary";
import { FOCUS_FRAME } from "@/core/ui/focus-frame";
import { Icon } from "@/core/ui/icon";
import { PageHeader } from "@/core/ui/page-header";
import { SavingsNav, type SavingsSection } from "./savings-nav";

type SavingsPageFrameProps = {
  info: ModuleInfo;
  current: SavingsSection;
  /** 頁首右邊的按鈕 例如記一筆 手機上換到標題下一行 */
  actions?: ReactNode;
  children: ReactNode;
};

/** 整頁的外框一直都在 按鈕或那一列不見而附近沒有外框時焦點落在這裡 */
export function SavingsPageFrame({ info, current, actions, children }: SavingsPageFrameProps) {
  return (
    <div data-accent={info.accent} {...FOCUS_FRAME} className="page-stack">
      {/* 分頁列跟頁首是一組 距離比區塊之間近 */}
      <div className="stack">
        <PageHeader icon={<Icon src={info.icon} />} title={info.name} actions={actions} />
        <SavingsNav current={current} />
      </div>
      {children}
    </div>
  );
}

/** 慢或讀不到只影響那一區 不會讓整頁變成錯誤畫面 */
export function StreamSection({ fallback, children }: { fallback: ReactNode; children: ReactNode }) {
  return (
    <CardErrorBoundary>
      <Suspense fallback={fallback}>{children}</Suspense>
    </CardErrorBoundary>
  );
}
