"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore, useTransition } from "react";
import { CAPTION_REFRESH_DELAY_MS, shouldRefreshForCaptions } from "../caption-refresh";

function subscribeVisibility(onChange: () => void): () => void {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
}

/** 清單上有從沒檢查過字幕的影片時才放：背景檢查做完後重新整理一次，「檢查字幕中」換成結果；每次重新整理後還有要檢查的影片才繼續，連續最多 CAPTION_REFRESH_LIMIT 次 */
export function CaptionCheckRefresh() {
  const router = useRouter();
  // 伺服器端算繪時當作看不到，hydrate 後才依分頁狀態開始計時
  const visible = useSyncExternalStore(subscribeVisibility, () => document.visibilityState === "visible", () => false);
  const [refreshing, startRefresh] = useTransition();
  const [refreshed, setRefreshed] = useState(0);

  useEffect(() => {
    if (!shouldRefreshForCaptions({ visible, refreshing, refreshed })) return;
    const timer = setTimeout(() => {
      setRefreshed((count) => count + 1);
      startRefresh(() => router.refresh());
    }, CAPTION_REFRESH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [visible, refreshing, refreshed, router]);

  return null;
}
