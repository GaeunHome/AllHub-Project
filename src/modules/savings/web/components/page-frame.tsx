import { Suspense, type ReactNode } from "react";
import type { ModuleInfo } from "@/core/module";
import { CardErrorBoundary } from "@/core/ui/card-error-boundary";
import { FOCUS_FRAME } from "@/core/ui/focus-frame";
import { Icon } from "@/core/ui/icon";
import { PageBanner } from "@/core/ui/page-banner";
import { PageTheme } from "@/core/ui/page-theme";
import { SavingsNav, type SavingsSection } from "./savings-nav";

type SavingsPageFrameProps = {
  info: ModuleInfo;
  current: SavingsSection;
  /** 頁首右邊的按鈕 例如記一筆 手機上換到標題下一行 */
  actions?: ReactNode;
  /** 橫幅裡標題下面的內容 總覽放總資產 */
  hero?: ReactNode;
  children: ReactNode;
};

/**
 * 使用者選的黑卡私人銀行 六頁都是固定深色的主題頁
 * 整頁的外框一直都在 按鈕或那一列不見而附近沒有外框時焦點落在這裡
 */
export function SavingsPageFrame({ info, current, actions, hero, children }: SavingsPageFrameProps) {
  return (
    <PageTheme accent={info.accent} className="theme-savings">
      <div {...FOCUS_FRAME} className="page-stack">
        {/* 分頁列跟頁首是一組 距離比區塊之間近 */}
        <div className="stack">
          <PageBanner image="/images/scenes/banner-finance-vault.svg" icon={<Icon src={info.icon} />} title={info.name} actions={actions} className="fin-banner">
            {hero}
          </PageBanner>
          <SavingsNav current={current} />
        </div>
        {children}
      </div>
    </PageTheme>
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
