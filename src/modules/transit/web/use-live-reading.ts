"use client";

import { useEffect, useState } from "react";
import { LIVE_INTERVAL_MS, type LiveReading } from "../lib/countdown";

const NONE: LiveReading = { kind: "none" };

/** active 才問 看不到分頁時不問 免費額度只留給真的在看的時候 */
export function useLiveReading(routeId: number, active: boolean): LiveReading {
  const [reading, setReading] = useState<LiveReading>(NONE);

  useEffect(() => {
    if (!active) return;
    let stopped = false;
    const load = async () => {
      if (document.visibilityState !== "visible") return;
      const response = await fetch(`/api/transit/live?route=${routeId}`).catch(() => null);
      if (!stopped && response?.ok) setReading((await response.json()) as LiveReading);
    };
    void load();
    const timer = setInterval(load, LIVE_INTERVAL_MS);
    document.addEventListener("visibilitychange", load);
    return () => {
      stopped = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", load);
    };
  }, [routeId, active]);

  return active ? reading : NONE;
}
