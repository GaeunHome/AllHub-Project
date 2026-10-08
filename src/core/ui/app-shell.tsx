import type { ReactNode } from "react";
import type { ModuleInfo } from "../module";
import { NotificationCenter } from "../notifications/center";
import { AppHeader } from "./app-header";
import type { NavModule } from "./nav-links";

/** 導覽列與內容都包在通知中心裡：鈴鐺、導覽膠囊、通知頁共用同一份未讀數；提示卡片由通知中心放在 header 外面（header 的 backdrop-filter 會框住 fixed 元素） */
export function AppShell({ modules, children }: { modules: ModuleInfo[]; children: ReactNode }) {
  // 只把導覽列用得到的欄位交給 client 元件，說明文字不必送到瀏覽器
  const navModules: NavModule[] = modules.map(({ id, name, href, icon, accent, notifies }) => ({ id, name, href, icon, accent, notifies }));

  return (
    <NotificationCenter modules={navModules}>
      <AppHeader modules={navModules} />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 pt-6 pb-16 sm:pt-10">{children}</main>
    </NotificationCenter>
  );
}
