import Link from "next/link";
import type { ReactNode } from "react";
import type { ModuleInfo } from "../module";
import { HomeNotifications } from "../notifications/home-notifications";
import { HomeCard } from "./home-card";
import { Icon } from "./icon";

const NOTIFICATIONS = { id: "notifications", name: "通知", href: "/notifications", icon: "/icons/ui/bell.svg" } as const;

type HomePageProps = {
  modules: ModuleInfo[];
  /** 一張一列的卡片（有縮圖、預覽圖，需要寬度） */
  wide: ReactNode;
  /** 兩張並排、等寬等高的卡片；最後一張固定是未讀通知 */
  compact: ReactNode;
};

/** 卡片由 src/app 從各模組的 web/pages 組合進來（core 不 import 模組），這裡只負責排版 */
export function HomePage({ modules, wide, compact }: HomePageProps) {
  return (
    <div className="page-stack">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">嗨，歡迎回來</h1>
        {/* 原本首頁的模組入口縮成一排；沒有首頁卡片的模組也從這裡進去 */}
        <nav aria-label="所有功能">
          <ul className="grid grid-cols-4 gap-2 sm:flex sm:flex-wrap sm:justify-end">
            {modules.map((m) => (
              <li key={m.id} className="min-w-0">
                <Link href={m.href} data-accent={m.accent} className="home-module-link">
                  {m.icon ? <Icon src={m.icon} /> : <Icon name="sparkles" />}
                  <span className="max-w-full truncate">{m.name}</span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </header>
      {wide}
      <div className="grid grid-cols-1 gap-8 sm:grid-cols-2">
        {compact}
        <HomeCard info={NOTIFICATIONS} title="未讀通知" skeleton={null}>
          <HomeNotifications />
        </HomeCard>
      </div>
    </div>
  );
}
