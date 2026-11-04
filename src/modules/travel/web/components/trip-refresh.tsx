"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** 不輪詢 切回這個分頁時重新讀一次 看得到同行的人剛改的 使用者不要多的流量 */
export function TripRefresh() {
  const router = useRouter();
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [router]);
  return null;
}
