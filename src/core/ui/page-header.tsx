import type { ReactNode } from "react";
import { Icon, type UiIconName } from "./icon";

type PageHeaderProps = {
  icon?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
};

export function PageHeader({ icon, title, subtitle, actions }: PageHeaderProps) {
  return (
    <header className="flex flex-wrap items-center gap-x-4 gap-y-3">
      {icon && <span className="icon-tile size-12 rounded-2xl sm:size-14">{icon}</span>}
      <div className="flex min-w-48 flex-1 flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">{title}</h1>
        {subtitle && <p className="text-sm text-ink-soft">{subtitle}</p>}
      </div>
      {/* 手機上動作按鈕換到下一行，標題才不會被擠成一長條 */}
      {actions && <div className="button-row w-full sm:w-auto">{actions}</div>}
    </header>
  );
}

/** 放在卡片外面的區段標題（主題頁的區段）；跟內容的距離由外層的 gap 決定 */
export function SectionTitle({ icon, id, children }: { icon?: UiIconName; id?: string; children: ReactNode }) {
  return (
    <h2 id={id} className="flex min-h-7 items-center gap-2 text-lg font-semibold text-ink">
      {icon && <Icon name={icon} className="size-5 text-accent" />}
      {children}
    </h2>
  );
}

type CardHeaderProps = {
  /** 圖示方塊裡的圖示，例如 <Icon name="key-round" /> */
  icon?: ReactNode;
  /** 給 section 的 aria-labelledby 用 */
  id?: string;
  /** 標題列右邊的連結或按鈕；放不下時換到下一行 */
  actions?: ReactNode;
  children: ReactNode;
};

/** 卡片裡的標題列（首頁卡片也用這個）：圖示方塊、標題、右邊的動作，全站同一個樣子 */
export function CardHeader({ icon, id, actions, children }: CardHeaderProps) {
  return (
    <header className="flex min-h-9 flex-wrap items-center gap-x-3 gap-y-2">
      {icon && <span className="icon-tile size-9 rounded-xl">{icon}</span>}
      {/* basis-24：右邊的動作太寬（例如切換月份）時整個換到下一行，標題不會被擠成一個字一行 */}
      <h2 id={id} className="min-w-0 flex-1 basis-24 text-lg font-semibold text-ink">
        {children}
      </h2>
      {actions}
    </header>
  );
}
