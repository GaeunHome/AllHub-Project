"use client";

import { useLayoutEffect, useSyncExternalStore } from "react";
import { remainingSteps, type SetupStep } from "../../../lib/setup";
import { applyOverviewPrefs, clearOverviewPrefs, overviewPrefsScript, readOverviewPrefs, setupCollapsedPref, setupSkippedPref } from "./overview-prefs";

const noSubscribe = () => () => {};

/**
 * 偏好存在瀏覽器 靠 html 的屬性讓第一次繪製就對
 * pending 是伺服器算好的還沒做的步驟
 */
export function OverviewPrefsSync({ pending }: { pending: SetupStep[] }) {
  // 伺服器算繪與 hydration 時是 true 只有整頁載入時才需要腳本 瀏覽器端產生的 script 不會執行
  const serverRendered = useSyncExternalStore(noSubscribe, () => false, () => true);
  const pendingKey = pending.join(",");

  // 站內換頁時在繪製前標好 之後跟著偏好更新 其他分頁改的也算
  // 藏起來或卸載時拿掉 屬性才不會留到別頁
  useLayoutEffect(() => {
    const root = document.documentElement;
    const steps = pendingKey === "" ? [] : (pendingKey.split(",") as SetupStep[]);
    const hidden = steps.length > 0 && remainingSteps(steps.map((step) => ({ step, done: false })), readOverviewPrefs().skipped).length === 0;
    const apply = () => applyOverviewPrefs(root, readOverviewPrefs(), hidden);
    apply();
    const unsubscribe = [setupCollapsedPref, setupSkippedPref].map((pref) => pref.subscribe(apply));
    return () => {
      unsubscribe.forEach((stop) => stop());
      clearOverviewPrefs(root);
    };
  }, [pendingKey]);

  return serverRendered ? <script dangerouslySetInnerHTML={{ __html: overviewPrefsScript(pending) }} /> : null;
}
