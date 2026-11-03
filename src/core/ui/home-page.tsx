import Link from "next/link";
import { Fragment, Suspense, type ReactNode } from "react";
import { requireSession, usableModules } from "../auth";
import { displayNameOf } from "../auth/nickname";
import { pageModules, type ModuleInfo } from "../module";
import { HomeNotifications } from "../notifications/home-notifications";
import { HomeCard } from "./home-card";
import { Icon } from "./icon";
import { LoadingState, Skeleton } from "./skeleton";

const NOTIFICATIONS = { id: "notifications", name: "通知", href: "/notifications", icon: "/icons/ui/bell.svg" } as const;
const MODULE_LINKS = "grid grid-cols-4 gap-2 sm:flex sm:flex-wrap sm:justify-end";

/** id 是模組 id core 依它過濾 被關掉的模組整張卡片不算繪 */
export type HomeSlot = { id: string; card: ReactNode };

type HomeCardsProps = {
  /** 最上面的區塊 兩張並排等寬等高 手機單欄 */
  top: HomeSlot[];
  /** 有縮圖或預覽圖需要寬度的卡片 一張一列不並排 */
  wide: HomeSlot[];
  /**
   * 內容少 拉成一長條會很空的卡片 平常跟 wide 一樣一張一列
   * 超寬螢幕時跟並排的那組各佔半列
   */
  half: HomeSlot[];
  /**
   * 兩欄並排等寬等高 超寬螢幕時在 half 旁邊上下排
   * 最後固定是未讀通知 雙數張時獨佔一整列 單數張時補滿最後一格 旁邊都不會空一格
   */
  compact: HomeSlot[];
};

type HomePageProps = HomeCardsProps & { modules: ModuleInfo[] };

const cardsOf = (slots: HomeSlot[]) => slots.map(({ id, card }) => <Fragment key={id}>{card}</Fragment>);

/** core 不 import 模組 卡片由 src/app 組合進來 這裡只負責過濾與排版 */
export function HomePage({ modules, top, wide, half, compact }: HomePageProps) {
  return (
    <div className="page-stack">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold tracking-tight break-words text-ink sm:text-3xl">
          嗨，
          <Suspense fallback={null}>
            <GreetingName />
          </Suspense>
          歡迎回來
        </h1>
        {/* 模組入口縮成一排 沒有首頁卡片的模組也從這裡進去 */}
        <nav aria-label="所有功能">
          <Suspense fallback={<ModuleLinksSkeleton count={pageModules(modules).length} />}>
            <HomeModuleLinks modules={modules} />
          </Suspense>
        </nav>
      </header>
      {/* 能用哪些模組要讀資料庫 卡片的外框等讀到才畫 被關掉的模組不會先閃出來 */}
      <Suspense fallback={<HomeCardsSkeleton />}>
        <HomeCards top={top} wide={wide} half={half} compact={compact} />
      </Suspense>
    </div>
  );
}

/** 問候語先出現 名字等資料庫 */
export async function GreetingName() {
  return `${displayNameOf(await requireSession())}，`;
}

export async function HomeModuleLinks({ modules }: { modules: ModuleInfo[] }) {
  const usable = await usableModules(pageModules(modules));
  return (
    <ul className={MODULE_LINKS}>
      {usable.map((m) => (
        <li key={m.id} className="min-w-0">
          <Link href={m.href} data-accent={m.accent} className="home-module-link">
            <Icon src={m.icon} />
            <span className="max-w-full truncate">{m.name}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export async function HomeCards({ top, wide, half, compact }: HomeCardsProps) {
  const [shownTop, shownWide, shownHalf, shownCompact] = await Promise.all([usableModules(top), usableModules(wide), usableModules(half), usableModules(compact)]);
  const hasHalf = shownHalf.length > 0;
  // 張數照過濾後算 理財被關掉時未讀通知要獨佔一整列
  const compactOdd = shownCompact.length % 2 === 1;
  const notificationSpan = compactOdd ? undefined : hasHalf ? "sm:col-span-2 2xl:col-span-1" : "sm:col-span-2";
  return (
    <>
      {shownTop.length > 0 && <div className={shownTop.length > 1 ? "grid grid-cols-1 gap-8 sm:grid-cols-2" : "grid grid-cols-1 gap-8"}>{cardsOf(shownTop)}</div>}
      {/* 排欄寫在各自的外框上 不挑第幾個子元素
          items-start 讓同一列不互相拉高 便箋很長時旁邊才不會留一大片空白 */}
      <div className="grid grid-cols-1 gap-8 2xl:grid-cols-2 2xl:items-start">
        {/* 寬卡片不並排 直播常只有一兩位 並排會被影片格拉高留下一大片空白 */}
        {shownWide.length > 0 && <div className="page-stack 2xl:col-span-2">{cardsOf(shownWide)}</div>}
        {cardsOf(shownHalf)}
        {/* 超寬螢幕時在 half 旁邊改上下排 並排的話會比旁邊矮很多 底下留一大片空白 */}
        <div className={`grid grid-cols-1 gap-8 sm:grid-cols-2 ${hasHalf ? "2xl:grid-cols-1" : "2xl:col-span-2"}`}>
          {cardsOf(shownCompact)}
          <HomeCard info={NOTIFICATIONS} title="未讀通知" skeleton={null} className={notificationSpan}>
            <HomeNotifications />
          </HomeCard>
        </div>
      </div>
    </>
  );
}

function ModuleLinksSkeleton({ count }: { count: number }) {
  return (
    <div aria-hidden className={MODULE_LINKS}>
      {Array.from({ length: count }, (_, i) => (
        <Skeleton key={i} className="h-16 rounded-xl sm:h-11 sm:w-24" />
      ))}
    </div>
  );
}

function HomeCardsSkeleton() {
  return (
    <LoadingState label="載入首頁…" className="page-stack">
      <div className="grid grid-cols-1 gap-8 sm:grid-cols-2">
        <Skeleton className="h-56 rounded-2xl" />
        <Skeleton className="h-56 rounded-2xl" />
      </div>
      <Skeleton className="h-72 rounded-2xl" />
      <Skeleton className="h-72 rounded-2xl" />
    </LoadingState>
  );
}
