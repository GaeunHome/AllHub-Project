import Image from "next/image";
import Link from "next/link";
import { connection } from "next/server";
import { Fragment, Suspense, type ReactNode } from "react";
import { requireSession, usableModules } from "../auth";
import { displayNameOf } from "../auth/nickname";
import { pageModules, type ModuleInfo } from "../module";
import { HomeAnnouncements } from "../announcements/home-announcements";
import { HomeNotifications } from "../notifications/home-notifications";
import { formatTaipeiLongDate } from "../time";
import { QuietErrorBoundary } from "./card-error-boundary";
import { HomeCard } from "./home-card";
import { Icon } from "./icon";
import { NoticeStrip } from "./notice-strip";
import { LoadingState, Skeleton } from "./skeleton";

const NOTIFICATIONS = { id: "notifications", name: "通知", href: "/notifications", icon: "/icons/ui/bell.svg" } as const;
const MODULE_LINKS = "grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:justify-end";
// 單數個時最後一個撐滿一列 手機上旁邊才不會空一格 sm 以上是 flex 不受影響
const fillsRow = (index: number, count: number) => count % 2 === 1 && index === count - 1;

/**
 * id 是模組 id core 依它過濾 被關掉的模組整張卡片不算繪
 * shown 給平常不出現的卡片 回 false 時跟被關掉一樣 不算格子 不留外框
 */
export type HomeSlot = { id: string; card: ReactNode; shown?: () => Promise<boolean> };

type HomeCardsProps = {
  /** 最上面的區塊 寬螢幕天氣佔大半 提醒在旁邊 窄的時候單欄 */
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

type HomePageProps = HomeCardsProps & {
  modules: ModuleInfo[];
  /** 各模組要提醒的事 card 算繪成 NoticeItem 沒有事時不畫 */
  notices: HomeSlot[];
};

const cardsOf = (slots: HomeSlot[]) => slots.map(({ id, card }) => <Fragment key={id}>{card}</Fragment>);

/** 判斷時出錯只藏那一張 不影響首頁其他卡片 */
async function shownSlots(slots: HomeSlot[]): Promise<HomeSlot[]> {
  const usable = await usableModules(slots);
  const flags = await Promise.all(usable.map(({ shown }) => (shown ? shown().catch(() => false) : true)));
  return usable.filter((_, index) => flags[index]);
}

/** core 不 import 模組 卡片由 src/app 組合進來 這裡只負責過濾與排版 */
export function HomePage({ modules, notices, top, wide, half, compact }: HomePageProps) {
  return (
    <div className="page-stack">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="text-2xl font-bold tracking-tight break-words text-ink sm:text-3xl">
            嗨，
            <Suspense fallback={null}>
              <GreetingName />
            </Suspense>
            歡迎回來
          </h1>
          <p className="min-h-6 font-medium text-ink-soft">
            <Suspense fallback={null}>
              <TodayDate />
            </Suspense>
          </p>
        </div>
        {/* 模組入口縮成一排 沒有首頁卡片的模組也從這裡進去 */}
        <nav aria-label="所有功能">
          <Suspense fallback={<ModuleLinksSkeleton count={pageModules(modules).length} />}>
            <HomeModuleLinks modules={modules} />
          </Suspense>
        </nav>
      </header>
      <Suspense fallback={null}>
        <HomeNotices notices={notices} />
      </Suspense>
      {/* 能用哪些模組要讀資料庫 卡片的外框等讀到才畫 被關掉的模組不會先閃出來 */}
      <Suspense fallback={<HomeCardsSkeleton />}>
        <HomeCards top={top} wide={wide} half={half} compact={compact} />
      </Suspense>
      {/* 公告不該拖累上面的卡片 讀不到也不留外框 */}
      <QuietErrorBoundary>
        <Suspense fallback={null}>
          <HomeAnnouncements />
        </Suspense>
      </QuietErrorBoundary>
    </div>
  );
}

/** 問候語先出現 名字等資料庫 */
export async function GreetingName() {
  return `${displayNameOf(await requireSession())}，`;
}

/** 日期要用這次請求的時間算 預先算好的話過了午夜還是昨天 */
export async function TodayDate() {
  await connection();
  return formatTaipeiLongDate(new Date());
}

export async function HomeModuleLinks({ modules }: { modules: ModuleInfo[] }) {
  const usable = await usableModules(pageModules(modules));
  return (
    <ul className={MODULE_LINKS}>
      {usable.map((m, index) => {
        const wide = fillsRow(index, usable.length);
        return (
          <li key={m.id} className={wide ? "col-span-2 min-w-0" : "min-w-0"}>
            <Link href={m.href} className="home-module-link">
              {/* 撐滿一列時圖放大 從上緣裁才不會切到圖上的主角 */}
              {m.cover && <Image src={m.cover} alt="" fill unoptimized loading="eager" sizes="10rem" className={wide ? "home-module-cover max-sm:object-top" : "home-module-cover"} />}
              <Icon src={m.icon} />
              <span className="max-w-full truncate">{m.name}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/** 一個模組讀不到不影響其他模組 那個模組的卡片會自己說明 */
export async function HomeNotices({ notices }: { notices: HomeSlot[] }) {
  const shown = await usableModules(notices);
  return (
    <NoticeStrip label="今天要注意">
      {shown.map(({ id, card }) => (
        <QuietErrorBoundary key={id}>
          <Suspense fallback={null}>{card}</Suspense>
        </QuietErrorBoundary>
      ))}
    </NoticeStrip>
  );
}

export async function HomeCards({ top, wide, half, compact }: HomeCardsProps) {
  const [shownTop, shownWide, shownHalf, shownCompact] = await Promise.all([shownSlots(top), shownSlots(wide), shownSlots(half), shownSlots(compact)]);
  const hasHalf = shownHalf.length > 0;
  // 張數照過濾後算 理財被關掉時未讀通知要獨佔一整列
  const compactOdd = shownCompact.length % 2 === 1;
  const notificationSpan = compactOdd ? undefined : hasHalf ? "sm:col-span-2 2xl:col-span-1" : "sm:col-span-2";
  return (
    <>
      {shownTop.length > 0 && <div className={shownTop.length > 1 ? "grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]" : "grid grid-cols-1 gap-8"}>{cardsOf(shownTop)}</div>}
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
        <Skeleton key={i} className={fillsRow(i, count) ? "col-span-2 h-16 rounded-xl sm:w-32" : "h-16 rounded-xl sm:w-32"} />
      ))}
    </div>
  );
}

function HomeCardsSkeleton() {
  return (
    <LoadingState label="載入首頁…" className="page-stack">
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Skeleton className="h-80 rounded-2xl" />
        <Skeleton className="h-80 rounded-2xl" />
      </div>
      <Skeleton className="h-72 rounded-2xl" />
      <Skeleton className="h-72 rounded-2xl" />
    </LoadingState>
  );
}
