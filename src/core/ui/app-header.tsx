import Link from "next/link";
import { Suspense } from "react";
import { requireSession } from "../auth";
import { NotificationBell } from "../notifications/bell";
import { AccountMenu, AccountMenuLink } from "./account-menu";
import { HeaderMenus } from "./header-menus";
import { Icon } from "./icon";
import { NavLinkList, NavLinks, type NavModule } from "./nav-links";

export function AppHeader({ modules }: { modules: NavModule[] }) {
  return (
    <header className="app-header">
      {/* relative：手機上鈴鐺面板與帳號選單以整列為準展開，才不會超出畫面 */}
      <div className="relative mx-auto flex max-w-5xl items-center gap-2 px-4 py-2.5 sm:gap-4">
        {/* 標誌只有 32px：用透明的偽元素往外撐 6px，點擊範圍到 44px，版面不會跟著移動 */}
        <Link href="/" aria-label="AllHub 首頁" className="relative flex shrink-0 items-center gap-2 rounded-full before:absolute before:-inset-1.5 before:content-['']">
          <span className="logo-mark size-8">
            <Icon name="flower-2" className="size-[1.125rem]" />
          </span>
          {/* 很窄的手機上只留圖示，右邊的鈴鐺與帳號才放得下 */}
          <span className="text-gradient hidden text-xl font-bold tracking-tight min-[25rem]:inline">AllHub</span>
        </Link>
        <nav aria-label="模組" className="no-scrollbar -my-1 min-w-0 flex-1 overflow-x-auto py-1">
          {/* 觀看頁是動態路由，預先算繪時還不知道網址，先放沒有高亮的版本 */}
          <Suspense fallback={<NavLinkList modules={modules} pathname={null} />}>
            <NavLinks modules={modules} />
          </Suspense>
        </nav>
        <HeaderMenus>
          <div className="flex shrink-0 items-center gap-0.5 sm:gap-1">
            <NotificationBell />
            {/* 只有帳號名稱要等資料庫，按鈕與選單都能先算繪好 */}
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

/** 跟版面的 SessionGuard 在同一次請求裡，requireSession 只查一次資料庫 */
async function SignedInUsername() {
  const { username } = await requireSession();
  return username;
}

/** 只是不顯示入口；管理頁與它的 Server Action 都會再用 requireOwner 檢查 */
export async function OwnerMenuLink() {
  const { role } = await requireSession();
  if (role !== "owner") return null;
  return (
    <AccountMenuLink href="/admin" icon="shield-check">
      管理
    </AccountMenuLink>
  );
}
