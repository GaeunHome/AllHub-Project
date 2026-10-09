import type { ReactNode } from "react";
import { Icon, type UiIconName } from "@/core/ui/icon";

/** 次要資訊收在預設關著的區塊：放在同一張卡片裡一列一個，打開才看得到內容（不必 JavaScript） */
export function SectionDisclosure({ icon, title, children }: { icon: UiIconName; title: string; children: ReactNode }) {
  return (
    <details className="group">
      <summary className="flex min-h-16 cursor-pointer list-none items-center gap-3 px-5 py-3 sm:px-6 [&::-webkit-details-marker]:hidden">
        <span className="icon-tile size-9 rounded-xl">
          <Icon name={icon} />
        </span>
        <span className="flex-1 text-lg font-semibold text-ink">{title}</span>
        <Icon name="chevron-down" className="size-5 text-ink-soft transition-transform group-open:rotate-180" />
      </summary>
      <div className="border-t border-line p-5 sm:p-6">{children}</div>
    </details>
  );
}
