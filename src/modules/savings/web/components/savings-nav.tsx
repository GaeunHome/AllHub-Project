import Link from "next/link";
import { Icon, type UiIconName } from "@/core/ui/icon";
import { SAVINGS_PATHS } from "../paths";

export type SavingsSection = "overview" | "records" | "settings";

const SECTIONS: { id: SavingsSection; href: string; label: string; icon: UiIconName }[] = [
  { id: "overview", href: SAVINGS_PATHS.overview, label: "總覽", icon: "layout-dashboard" },
  { id: "records", href: SAVINGS_PATHS.records, label: "紀錄", icon: "list" },
  { id: "settings", href: SAVINGS_PATHS.settings, label: "設定", icon: "settings" },
];

/** 理財三頁共用 手機上放得下三個 不用橫向捲動 */
export function SavingsNav({ current }: { current: SavingsSection }) {
  return (
    <nav aria-label="理財的頁面" className="flex flex-wrap gap-2">
      {SECTIONS.map((section) => (
        <Link key={section.id} href={section.href} aria-current={section.id === current ? "page" : undefined} className="nav-pill">
          <Icon name={section.icon} className="size-4" />
          {section.label}
        </Link>
      ))}
    </nav>
  );
}
