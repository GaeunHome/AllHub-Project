"use client";

import Link from "next/link";
import { useRef } from "react";
import { useRevealCurrent } from "@/core/ui/nav-links";
import { SAVINGS_PATHS } from "../paths";

export type SavingsSection = "overview" | "records" | "accounts" | "investments" | "recurring" | "settings";

const SECTIONS: { id: SavingsSection; href: string; label: string }[] = [
  { id: "overview", href: SAVINGS_PATHS.overview, label: "總覽" },
  { id: "records", href: SAVINGS_PATHS.records, label: "紀錄" },
  { id: "accounts", href: SAVINGS_PATHS.accounts, label: "帳戶" },
  { id: "investments", href: SAVINGS_PATHS.investments, label: "投資" },
  { id: "recurring", href: SAVINGS_PATHS.recurring, label: "每月固定" },
  { id: "settings", href: SAVINGS_PATHS.settings, label: "設定" },
];

/** 手機放不下六個分頁時橫向捲動 目前的分頁捲進畫面 右緣淡出提示還能滑 */
export function SavingsNav({ current }: { current: SavingsSection }) {
  const listRef = useRef<HTMLUListElement>(null);
  useRevealCurrent(listRef, current);

  return (
    <nav aria-label="理財的頁面" className="nav-scroll no-scrollbar -m-1 overflow-x-auto p-1">
      <ul ref={listRef} className="flex w-max gap-2">
        {SECTIONS.map((section) => (
          <li key={section.id} className="shrink-0">
            <Link href={section.href} aria-current={section.id === current ? "page" : undefined} className="nav-pill">
              {section.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
