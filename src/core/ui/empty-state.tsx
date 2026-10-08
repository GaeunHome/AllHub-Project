import type { ReactNode } from "react";
import { Icon, type UiIconName } from "./icon";

export function EmptyState({ icon = "flower-2", title, hint }: { icon?: UiIconName; title: ReactNode; hint?: ReactNode }) {
  return (
    <div className="empty-state">
      <span className="icon-tile size-12 rounded-full">
        <Icon name={icon} />
      </span>
      <p className="font-semibold text-ink">{title}</p>
      {hint && <p className="max-w-sm text-sm text-muted">{hint}</p>}
    </div>
  );
}
