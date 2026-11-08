import { usableModules } from "../auth";
import { pushKeys } from "../env";
import type { NotificationModule } from "./notification-summary";
import { AlertSettingsHelp, AlertSwitchTable, BrowserPermissionNotice, NotificationSettings } from "./settings";

// 提醒方式只列這個人能用的模組 要讀資料庫 所以在伺服器挑好再交給瀏覽器的開關

/** 鈴鐺面板 面板打開時才算繪 */
export async function BellAlertSettings({ modules }: { modules: NotificationModule[] }) {
  const usable = await usableModules(modules);
  return (
    <>
      <AlertSwitchTable modules={usable} />
      <AlertSettingsHelp />
      <BrowserPermissionNotice modules={usable} />
    </>
  );
}

/** 通知頁 */
export async function UsableNotificationSettings({ modules }: { modules: NotificationModule[] }) {
  return <NotificationSettings modules={await usableModules(modules)} pushKey={pushKeys()?.publicKey ?? null} />;
}
