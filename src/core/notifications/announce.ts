import { claimAlerts, planAlerts } from "./alerts";
import { chime } from "./chime";
import { readAlertPref } from "./prefs";
import { shouldShowSystemNotification, showSystemNotification } from "./system-notification";
import type { NotificationItem } from "./types";

const MAX_SYSTEM_NOTIFICATIONS = 3;

type AnnounceHandlers = {
  /** 要跳卡片的通知 舊的在前 */
  onToasts: (items: NotificationItem[]) => void;
  /** 點了系統通知 */
  onOpen: (item: NotificationItem) => void;
};

function localStorageOrNull(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/**
 * 新通知依各模組的設定跳卡片 播提示音 分頁在背景時跳系統通知
 * 同一則只由一個分頁提醒 每次都重讀設定 別的分頁或鈴鐺面板剛改過也算數
 */
export function announceFresh(fresh: NotificationItem[], { onToasts, onOpen }: AnnounceHandlers): void {
  const claimed = new Set(claimAlerts(fresh.map((item) => item.id), localStorageOrNull()));
  const plan = planAlerts(fresh, claimed, readAlertPref);
  if (plan.toasts.length > 0) onToasts(plan.toasts);
  if (plan.sound) chime.play();
  const supported = "Notification" in window;
  const conditions = { supported, permission: supported ? Notification.permission : "denied", enabled: plan.system.length > 0, hidden: document.visibilityState === "hidden" } as const;
  if (!shouldShowSystemNotification(conditions)) return;
  for (const item of plan.system.slice(-MAX_SYSTEM_NOTIFICATIONS)) {
    try {
      showSystemNotification(item, { NotificationImpl: Notification, onOpen, focus: () => window.focus() });
    } catch {
      // Android 的 Chrome 只讓 Service Worker 顯示通知
      // new Notification 會丟錯 卡片與提示音照常
    }
  }
}
