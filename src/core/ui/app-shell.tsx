import type { ReactNode } from "react";
import type { ModuleInfo } from "../module";
import { NotificationCenter } from "../notifications/center";
import { AppHeader, SHELL_FRAME } from "./app-header";
import type { NavModule } from "./nav-links";

/**
 * 都包在通知中心裡 鈴鐺 導覽膠囊與通知頁才共用同一份未讀數
 * 提示卡片放在 header 外面 header 的 backdrop-filter 會框住 fixed 元素
 */
export function AppShell({ modules, children }: { modules: ModuleInfo[]; children: ReactNode }) {
  // 只把導覽列用得到的欄位交給 client 元件 說明文字不必送到瀏覽器
  const navModules: NavModule[] = modules.map(({ id, name, href, icon, accent, notifies }) => ({ id, name, href, icon, accent, notifies }));

  return (
    <NotificationCenter modules={navModules}>
      <AppHeader modules={navModules} />
      {/* 登入頁靠 data-app-shell 認出前一個人藏在 Activity 裡的頁面 */}
      <main className={`flex-1 pt-6 pb-16 sm:pt-10 ${SHELL_FRAME}`} data-app-shell="">
        {children}
      </main>
    </NotificationCenter>
  );
}
