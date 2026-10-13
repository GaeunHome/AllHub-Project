import Link from "next/link";
import type { ReactNode } from "react";
import type { ModuleInfo } from "../module";
import { HomeNotifications } from "../notifications/home-notifications";
import { HomeCard } from "./home-card";
import { Icon } from "./icon";

const NOTIFICATIONS = { id: "notifications", name: "通知", href: "/notifications", icon: "/icons/ui/bell.svg" } as const;

type HomePageProps = {
  modules: ModuleInfo[];
  /** 一張一列的卡片（有縮圖、預覽圖，需要寬度），彼此不並排 */
  wide: ReactNode;
  /** 跟 wide 一樣一張一列；超寬螢幕時改成跟並排的那組各佔半列（內容比較少、拉成一長條會很空的卡片） */
  half?: ReactNode;
  /** 兩張並排、等寬等高的卡片（超寬螢幕時在 half 旁邊上下排）；最後一張固定是未讀通知 */
  compact: ReactNode;
};

/** 卡片由 src/app 從各模組的 web/pages 組合進來（core 不 import 模組），這裡只負責排版 */
export function HomePage({ modules, wide, half, compact }: HomePageProps) {
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
      {/* 排欄寫在各自的外框上（不挑第幾個子元素）；items-start：同一列的卡片不互相拉高，便箋很長時旁邊兩張不會留一大片空白 */}
      <div className="grid grid-cols-1 gap-8 2xl:grid-cols-2 2xl:items-start">
        {/* 寬卡片不互相並排：直播常常只有一兩位，並排會被旁邊的影片格拉高、留一大片空白 */}
        <div className="page-stack 2xl:col-span-2">{wide}</div>
        {half}
        {/* 超寬螢幕時在 half 旁邊改成上下排：右半邊夠寬，兩張並排會比旁邊的卡片矮很多、底下留一大片空白 */}
        <div className={`grid grid-cols-1 gap-8 sm:grid-cols-2 ${half ? "2xl:grid-cols-1" : "2xl:col-span-2"}`}>
          {compact}
          <HomeCard info={NOTIFICATIONS} title="未讀通知" skeleton={null}>
            <HomeNotifications />
          </HomeCard>
        </div>
      </div>
    </div>
  );
}
