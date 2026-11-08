import { Suspense, type ReactNode } from "react";
import { AnnouncementTicker } from "../announcements/announcement-ticker";
import type { ModuleInfo } from "../module";
import { NotificationCenter } from "../notifications/center";
import { AppHeader, SHELL_FRAME } from "./app-header";
import { QuietErrorBoundary } from "./card-error-boundary";
import { DragScrollRoot } from "./drag-scroll-root";
import { FOCUS_FRAME } from "./focus-frame";
import type { NavModule } from "./nav-links";
import { ToastProvider } from "./toast";

/**
 * 包在通知中心裡 鈴鐺與通知頁才共用同一份未讀數
 * 提示卡片放 header 外面 backdrop-filter 會框住 fixed 元素
 */
export function AppShell({ modules, children }: { modules: ModuleInfo[]; children: ReactNode }) {
  // 只把導覽列用得到的欄位交給 client 元件 說明文字不必送到瀏覽器
  const navModules: NavModule[] = modules.map(({ id, name, href, icon, accent, notifies, homeOnly }) => ({ id, name, href, icon, accent, notifies, homeOnly }));

  return (
    <ToastProvider>
      <DragScrollRoot />
      <NotificationCenter modules={navModules}>
        {/* 使用者要的 重要公告的跑馬燈在導覽列上面 讀不到就不出現 */}
        <QuietErrorBoundary>
          <Suspense fallback={null}>
            <AnnouncementTicker />
          </Suspense>
        </QuietErrorBoundary>
        <AppHeader modules={navModules} />
        {/* 登入頁靠 data-app-shell 認出前一個人藏在 Activity 裡的頁面 */}
        {/* 按鈕不見而附近沒有外框時 焦點至少落在 main */}
        <main className={`flex-1 pt-6 pb-16 sm:pt-10 ${SHELL_FRAME}`} data-app-shell="" {...FOCUS_FRAME}>
          {children}
        </main>
      </NotificationCenter>
    </ToastProvider>
  );
}
