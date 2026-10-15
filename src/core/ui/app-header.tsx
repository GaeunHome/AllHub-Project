import Link from "next/link";
import { Suspense } from "react";
import { requireSession } from "../auth";
import { NotificationBell } from "../notifications/bell";
import { AccountMenu, AccountMenuLink } from "./account-menu";
import { HeaderMenus } from "./header-menus";
import { Icon } from "./icon";
import { LiveClock } from "./live-clock";
import { NavLinkList, NavLinks, type NavModule } from "./nav-links";

/** 導覽列與內容共用的外框 左右邊線才對齊 超寬螢幕才置中 免得一行拉太長 */
export const SHELL_FRAME = "mx-auto w-full max-w-[120rem] px-4 sm:px-6 lg:px-8";

export function AppHeader({ modules }: { modules: NavModule[] }) {
  return (
    <header className="app-header">
      {/* relative 讓手機上的面板以整列為準展開 才不會超出畫面 */}
      <div className={`relative flex items-center gap-2 py-2.5 sm:gap-4 ${SHELL_FRAME}`}>
        {/* 標誌只有 32px 用透明偽元素往外撐 6px 點擊範圍到 44px 版面不動 */}
        <Link href="/" aria-label="AllHub 首頁" className="relative flex shrink-0 items-center gap-2 rounded-full before:absolute before:-inset-1.5 before:content-['']">
          <span className="logo-mark size-8">
            <Icon name="flower-2" className="size-[1.125rem]" />
          </span>
          {/* 比 1024px 窄時只留圖示 模組按鈕與時鐘才放得下 */}
          <span className="hidden text-xl font-bold tracking-tight text-ink lg:inline">AllHub</span>
        </Link>
        <nav aria-label="模組" className="nav-scroll no-scrollbar -my-1 min-w-0 flex-1 overflow-x-auto py-1">
          {/* 觀看頁是動態路由 預先算繪時不知道網址 先放沒有高亮的版本 */}
          <Suspense fallback={<NavLinkList modules={modules} pathname={null} />}>
            <NavLinks modules={modules} />
          </Suspense>
        </nav>
        <HeaderMenus>
          <div className="flex shrink-0 items-center gap-0.5 sm:gap-1">
            {/* 跟鈴鐺與帳號同一組 手機上不會被擠掉 放不下時改由導覽膠囊橫捲 */}
            <LiveClock />
            <NotificationBell />
            {/* 只有帳號名稱要等資料庫 按鈕與選單都能先算繪好 */}
            <AccountMenu
              username={
                <Suspense fallback={<span aria-hidden className="skeleton inline-block h-3 w-14 align-middle" />}>
                  <SignedInUsername />
                </Suspense>
              }
              ownerItems={
                <Suspense fallback={null}>
                  <OwnerMenuLink />
                </Suspense>
              }
            />
          </div>
        </HeaderMenus>
      </div>
    </header>
  );
}

/** 跟版面的 SessionGuard 在同一次請求裡 requireSession 只查一次資料庫 */
async function SignedInUsername() {
  const { username } = await requireSession();
  return username;
}

/** 只是不顯示入口 管理頁與它的 Server Action 都會再用 requireOwner 檢查 */
export async function OwnerMenuLink() {
  const { role } = await requireSession();
  if (role !== "owner") return null;
  return (
    <AccountMenuLink href="/admin" icon="shield-check">
      管理
    </AccountMenuLink>
  );
}
