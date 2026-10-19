import Link from "next/link";
import type { ReactNode } from "react";
import { pageModules, type ModuleInfo } from "../module";
import { HomeNotifications } from "../notifications/home-notifications";
import { HomeCard } from "./home-card";
import { Icon } from "./icon";

const NOTIFICATIONS = { id: "notifications", name: "通知", href: "/notifications", icon: "/icons/ui/bell.svg" } as const;

type HomePageProps = {
  modules: ModuleInfo[];
  /** 有縮圖或預覽圖需要寬度的卡片 一張一列不並排 */
  wide: ReactNode;
  /**
   * 內容少 拉成一長條會很空的卡片 平常跟 wide 一樣一張一列
   * 超寬螢幕時跟並排的那組各佔半列
   */
  half?: ReactNode;
  /**
   * 兩張並排等寬等高 超寬螢幕時在 half 旁邊上下排
   * 最後固定是未讀通知 兩欄時獨佔一整列 前面兩張一列時旁邊才不會空一格
   */
  compact: ReactNode;
};

/** core 不 import 模組 卡片由 src/app 組合進來 這裡只負責排版 */
export function HomePage({ modules, wide, half, compact }: HomePageProps) {
  return (
    <div className="page-stack">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">嗨，歡迎回來</h1>
        {/* 模組入口縮成一排 沒有首頁卡片的模組也從這裡進去 */}
        <nav aria-label="所有功能">
          <ul className="grid grid-cols-4 gap-2 sm:flex sm:flex-wrap sm:justify-end">
            {pageModules(modules).map((m) => (
              <li key={m.id} className="min-w-0">
                <Link href={m.href} data-accent={m.accent} className="home-module-link">
                  <Icon src={m.icon} />
                  <span className="max-w-full truncate">{m.name}</span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </header>
      {/* 排欄寫在各自的外框上 不挑第幾個子元素
          items-start 讓同一列不互相拉高 便箋很長時旁邊才不會留一大片空白 */}
      <div className="grid grid-cols-1 gap-8 2xl:grid-cols-2 2xl:items-start">
        {/* 寬卡片不並排 直播常只有一兩位 並排會被影片格拉高留下一大片空白 */}
        <div className="page-stack 2xl:col-span-2">{wide}</div>
        {half}
        {/* 超寬螢幕時在 half 旁邊改上下排 兩張並排會比旁邊矮很多 底下留一大片空白 */}
        <div className={`grid grid-cols-1 gap-8 sm:grid-cols-2 ${half ? "2xl:grid-cols-1" : "2xl:col-span-2"}`}>
          {compact}
          <HomeCard info={NOTIFICATIONS} title="未讀通知" skeleton={null} className={half ? "sm:col-span-2 2xl:col-span-1" : "sm:col-span-2"}>
            <HomeNotifications />
          </HomeCard>
        </div>
      </div>
    </div>
  );
}
