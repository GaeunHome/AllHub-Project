import type { NotificationItem } from "./types";

type Conditions = { supported: boolean; permission: NotificationPermission; enabled: boolean; hidden: boolean };

/** 頁面在前景時右下角的提示卡片就夠了，只有在背景才跳系統通知 */
export function shouldShowSystemNotification({ supported, permission, enabled, hidden }: Conditions): boolean {
  return supported && permission === "granted" && enabled && hidden;
}

export type PermissionState = NotificationPermission | "unsupported";

export type PermissionNotice = "request" | "denied" | "unsupported";

/** 有任何模組開著瀏覽器通知、權限卻還沒拿到時才提示；都關著就不打擾；null 是伺服器算繪時還不知道權限 */
export function permissionNotice(permission: PermissionState | null, anyEnabled: boolean): PermissionNotice | null {
  if (!anyEnabled || permission === null || permission === "granted") return null;
  return permission === "default" ? "request" : permission;
}

/** 打開開關這一下就是使用者的操作，瀏覽器才允許跳出詢問；已經決定過的權限只能到瀏覽器的網站設定改 */
export function shouldRequestPermission(permission: PermissionState, enabling: boolean): boolean {
  return enabling && permission === "default";
}

type ShowOptions = {
  NotificationImpl: typeof Notification;
  onOpen: (item: NotificationItem) => void;
  focus: () => void;
};

export function showSystemNotification(item: NotificationItem, { NotificationImpl, onOpen, focus }: ShowOptions): Notification {
  // 同一則用同一個 tag：開了好幾個分頁也只會留一個
  const notification = new NotificationImpl(item.title, { body: item.body, tag: `allhub-notification-${item.id}`, icon: "/favicon.ico" });
  notification.onclick = (event) => {
    event.preventDefault();
    focus();
    onOpen(item);
    notification.close();
  };
  return notification;
}
