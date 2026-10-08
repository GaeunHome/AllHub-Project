"use client";

import { useCallback, useSyncExternalStore } from "react";
import { createLocalPref, onOff, type LocalPref } from "../ui/local-pref";
import type { AlertKind } from "./alerts";

// 提醒方式是每台裝置各自的偏好（手機可能想靜音），存在瀏覽器而不是資料庫；每個模組各自一組
const LEGACY: Record<AlertKind, LocalPref<boolean>> = {
  sound: createLocalPref({ key: "allhub:notifications:sound", defaultValue: true, ...onOff }),
  browser: createLocalPref({ key: "allhub:notifications:browser", defaultValue: true, ...onOff }),
};

// useSyncExternalStore 要拿到同一個訂閱來源，同一組模組與種類只建立一次
const prefs = new Map<string, LocalPref<boolean>>();

function alertPref(moduleId: string, kind: AlertKind): LocalPref<boolean> {
  const key = `allhub:notifications:${kind}:${moduleId}`;
  let pref = prefs.get(key);
  if (!pref) {
    // 舊版只有全域開關：還沒個別設定的模組沿用舊值，關過的人更新後才不會突然開始響
    pref = createLocalPref({ key, defaultValue: true, ...onOff, fallback: () => LEGACY[kind].read() });
    prefs.set(key, pref);
  }
  return pref;
}

export const readAlertPref = (moduleId: string, kind: AlertKind): boolean => alertPref(moduleId, kind).read();

export const setAlertPref = (moduleId: string, kind: AlertKind, enabled: boolean): void => alertPref(moduleId, kind).save(enabled);

export const useAlertPref = (moduleId: string, kind: AlertKind): boolean => alertPref(moduleId, kind).useValue();

export const anyAlertPref = (moduleIds: readonly string[], kind: AlertKind): boolean => moduleIds.some((id) => readAlertPref(id, kind));

/** 這幾個模組的同一種設定有變動（包含其他分頁改的）就通知 */
export function subscribeAlertPrefs(moduleIds: readonly string[], kind: AlertKind, listener: () => void): () => void {
  const unsubscribes = moduleIds.map((id) => alertPref(id, kind).subscribe(listener));
  return () => unsubscribes.forEach((unsubscribe) => unsubscribe());
}

/** 任何一個模組開著就是 true；伺服器算繪時當成預設的全開 */
export function useAnyAlertPref(moduleIds: readonly string[], kind: AlertKind): boolean {
  // 陣列每次算繪都是新的，用內容當依賴，訂閱才不會一直重建
  const ids = moduleIds.join("\n");
  const subscribe = useCallback((listener: () => void) => subscribeAlertPrefs(ids ? ids.split("\n") : [], kind, listener), [ids, kind]);
  const read = useCallback(() => anyAlertPref(ids ? ids.split("\n") : [], kind), [ids, kind]);
  return useSyncExternalStore(subscribe, read, () => ids !== "");
}
