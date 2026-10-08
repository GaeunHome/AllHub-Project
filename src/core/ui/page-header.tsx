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
      <div className="min-w-48 flex-1">
        <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {/* 手機上動作按鈕換到下一行，標題才不會被擠成一長條 */}
      {actions && <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">{actions}</div>}
    </header>
  );
}

export function SectionTitle({ icon, children }: { icon?: UiIconName; children: ReactNode }) {
  return (
    <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold text-ink">
      {icon && <Icon name={icon} className="size-5 text-accent" />}
      {children}
    </h2>
  );
}
