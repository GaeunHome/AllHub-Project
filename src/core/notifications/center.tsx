"use client";

import { useRouter } from "next/navigation";
import { createContext, use, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { applyLocalRead, applyLocalReadAll, claimAlerts, freshNotifications, planAlerts } from "./alerts";
import { chime } from "./chime";
import { linkTarget } from "./links";
import type { NotificationModule } from "./notification-summary";
import { startPoller, type PollResult } from "./poller";
import { readAlertPref } from "./prefs";
import { shouldShowSystemNotification, showSystemNotification } from "./system-notification";
import { NotificationToasts } from "./toasts";
import { EMPTY_FEED, type NotificationFeed, type NotificationItem } from "./types";

const API = "/api/notifications";
const MAX_TOASTS = 3;
const MAX_SYSTEM_NOTIFICATIONS = 3;
const UNLOCK_EVENTS = ["pointerdown", "pointerup", "keydown"] as const;

type CenterValue = {
  feed: NotificationFeed;
  /** 目前看過最新的通知 id；通知頁靠它知道有新通知要重新整理 */
  latestId: number | null;
  /** 每來一批新通知加一，鈴鐺用它重播搖晃動畫 */
  ringCount: number;
  modules: ReadonlyMap<string, NotificationModule>;
  open(item: NotificationItem): void;
  markRead(ids: number[]): void;
  markAllRead(module?: string): void;
};

const NO_CENTER: CenterValue = { feed: EMPTY_FEED, latestId: null, ringCount: 0, modules: new Map(), open: () => {}, markRead: () => {}, markAllRead: () => {} };
const CenterContext = createContext<CenterValue>(NO_CENTER);

export function useNotificationCenter(): CenterValue {
  return use(CenterContext);
}

async function loadFeed(signal: AbortSignal): Promise<PollResult> {
  // 沒有 cookie 時 proxy 會轉址到登入頁；manual 讓它變成 opaqueredirect，不必真的去抓登入頁
  const response = await fetch(API, { cache: "no-store", redirect: "manual", signal, headers: { Accept: "application/json" } });
  if (response.status === 401 || response.type === "opaqueredirect") return { status: "unauthorized" };
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return { status: "ok", feed: (await response.json()) as NotificationFeed };
}

async function postMark(body: { action: "read"; ids: number[] } | { action: "read-all"; module?: string }): Promise<NotificationFeed | null> {
  const response = await fetch(API, { method: "POST", redirect: "manual", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return response.ok ? ((await response.json()) as NotificationFeed) : null;
}

function localStorageOrNull(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** 包住導覽列：輪詢未讀數，有新通知時依各模組的提醒設定跳提示卡片、播提示音、背景時跳系統通知 */
export function NotificationCenter({ modules, children }: { modules: NotificationModule[]; children: ReactNode }) {
  const router = useRouter();
  const [feed, setFeed] = useState<NotificationFeed>(EMPTY_FEED);
  const [toasts, setToasts] = useState<NotificationItem[]>([]);
  const [latestId, setLatestId] = useState<number | null>(null);
  const [ringCount, setRingCount] = useState(0);
  const lastSeenId = useRef<number | null>(null);
  const pendingMarks = useRef(0);
  const moduleMap = useMemo(() => new Map(modules.map((m) => [m.id, m])), [modules]);

  const sendMark = useCallback(async (body: Parameters<typeof postMark>[0]) => {
    pendingMarks.current += 1;
    try {
      const next = await postMark(body);
      if (next) setFeed(next);
    } catch {
      // 送不出去就等下一輪輪詢同步
    } finally {
      pendingMarks.current -= 1;
    }
  }, []);

  const markRead = useCallback(
    (ids: number[]) => {
      if (ids.length === 0) return;
      setFeed((current) => applyLocalRead(current, ids));
      void sendMark({ action: "read", ids });
    },
    [sendMark],
  );

  const markAllRead = useCallback(
    (module?: string) => {
      setFeed((current) => applyLocalReadAll(current, module));
      void sendMark(module ? { action: "read-all", module } : { action: "read-all" });
    },
    [sendMark],
  );

  const open = useCallback(
    (item: NotificationItem) => {
      if (!item.read) markRead([item.id]);
      const target = linkTarget(item.url);
      if (!target) return;
      if (target.external) window.open(target.href, "_blank", "noopener,noreferrer");
      else router.push(target.href);
    },
    [markRead, router],
  );

  // 輪詢的回呼只建立一次，透過 ref 拿到最新的 open 與模組清單
  const openRef = useRef(open);
  const modulesRef = useRef(moduleMap);
  const routerRef = useRef(router);
  useEffect(() => {
    openRef.current = open;
    modulesRef.current = moduleMap;
    routerRef.current = router;
  }, [open, moduleMap, router]);

  useEffect(() => {
    const announce = (fresh: NotificationItem[]) => {
      const claimed = new Set(claimAlerts(fresh.map((item) => item.id), localStorageOrNull()));
      // 每次都重讀設定：別的分頁或鈴鐺面板剛改過也算數
      const plan = planAlerts(fresh, claimed, readAlertPref);
      if (plan.toasts.length > 0) {
        setToasts((current) => [...plan.toasts.slice(-MAX_TOASTS).reverse(), ...current].slice(0, MAX_TOASTS));
        setRingCount((count) => count + 1);
      }
      if (plan.sound) chime.play();
      const supported = "Notification" in window;
      const conditions = { supported, permission: supported ? Notification.permission : "denied", enabled: plan.system.length > 0, hidden: document.visibilityState === "hidden" } as const;
      if (!shouldShowSystemNotification(conditions)) return;
      for (const item of plan.system.slice(-MAX_SYSTEM_NOTIFICATIONS)) {
        try {
          showSystemNotification(item, { NotificationImpl: Notification, onOpen: (n) => openRef.current(n), focus: () => window.focus() });
        } catch {
          // Android 的 Chrome 只允許 Service Worker 顯示系統通知，new Notification 會丟錯；提示卡片與提示音照常
        }
      }
    };

    const onFeed = (next: NotificationFeed) => {
      // 標已讀的請求還沒回來時不要用舊資料蓋掉畫面，下一輪再同步
      if (pendingMarks.current > 0) return;
      setFeed(next);
      const { fresh, lastSeenId: newest } = freshNotifications(next.recent, lastSeenId.current);
      lastSeenId.current = newest;
      setLatestId(newest);
      if (fresh.length === 0) return;
      announce(fresh);
      // 正在看的模組頁（例如 /youtube）有新紀錄時順便重新抓，清單不用手動重新整理；只比對完全相同的路徑，觀看頁不受影響
      const path = window.location.pathname;
      if (fresh.some((item) => modulesRef.current.get(item.module)?.href === path)) routerRef.current.refresh();
    };

    const poller = startPoller({
      load: loadFeed,
      onFeed,
      // session 失效（例如在別的裝置改了密碼）：重新整理畫面，SessionGuard 會把這個分頁導回登入頁
      onUnauthorized: () => routerRef.current.refresh(),
      isHidden: () => document.visibilityState === "hidden",
    });
    const onVisibility = () => poller.visibilityChanged();
    const onWake = () => poller.refresh();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onWake);
    window.addEventListener("online", onWake);
    return () => {
      poller.stop();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onWake);
      window.removeEventListener("online", onWake);
    };
  }, []);

  // 瀏覽器規定使用者在頁面上互動過才能播聲音：第一次點擊或按鍵時就把音效準備好
  useEffect(() => {
    const unlock = () => chime.unlock();
    for (const type of UNLOCK_EVENTS) window.addEventListener(type, unlock, { capture: true, once: true, passive: true });
    return () => {
      for (const type of UNLOCK_EVENTS) window.removeEventListener(type, unlock, { capture: true });
    };
  }, []);

  const dismissToast = useCallback((id: number) => setToasts((current) => current.filter((toast) => toast.id !== id)), []);

  const value = useMemo<CenterValue>(
    () => ({ feed, latestId, ringCount, modules: moduleMap, open, markRead, markAllRead }),
    [feed, latestId, ringCount, moduleMap, open, markRead, markAllRead],
  );

  return (
    <CenterContext value={value}>
      {children}
      <NotificationToasts toasts={toasts} modules={moduleMap} onOpen={open} onDismiss={dismissToast} />
    </CenterContext>
  );
}
