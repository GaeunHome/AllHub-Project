import { Suspense, type ReactNode } from "react";
import type { ModuleInfo } from "@/core/module";
import { CardErrorBoundary } from "@/core/ui/card-error-boundary";
import { DialogMessageScope } from "@/core/ui/dialog";
import { Icon } from "@/core/ui/icon";
import { PageHeader } from "@/core/ui/page-header";
import { EntranceScope } from "./motion/entrance-scope";
import { SavingsNav, type SavingsSection } from "./savings-nav";

/**
 * 視窗都會留下成功訊息 同一頁只留最新一則
 * 進場動畫只在第一次看到時播 上一頁回來不重播
 */
export function SavingsPageFrame({ info, current, children }: { info: ModuleInfo; current: SavingsSection; children: ReactNode }) {
  return (
    <DialogMessageScope>
      <EntranceScope data-accent={info.accent} className="page-stack">
        {/* 分頁列跟頁首是一組 距離比區塊之間近 */}
        <div className="stack">
          <PageHeader icon={info.icon && <Icon src={info.icon} />} title={info.name} />
          <SavingsNav current={current} />
        </div>
        {children}
      </EntranceScope>
    </DialogMessageScope>
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
