"use client";

import { useCallback, useSyncExternalStore } from "react";
import { createLocalPref, onOff, type LocalPref } from "../ui/local-pref";
import type { AlertKind } from "./alerts";

// 每台裝置的偏好不同 例如手機想靜音 所以存在瀏覽器 每個模組各一組
const LEGACY: Record<AlertKind, LocalPref<boolean>> = {
  sound: createLocalPref({ key: "allhub:notifications:sound", defaultValue: true, ...onOff }),
  browser: createLocalPref({ key: "allhub:notifications:browser", defaultValue: true, ...onOff }),
};

// useSyncExternalStore 要同一個訂閱來源 同一組模組與種類只建一次
const prefs = new Map<string, LocalPref<boolean>>();

function alertPref(moduleId: string, kind: AlertKind): LocalPref<boolean> {
  const key = `allhub:notifications:${kind}:${moduleId}`;
  let pref = prefs.get(key);
  if (!pref) {
    // 舊版只有全域開關 沒個別設定的沿用舊值 關過的人更新後才不會突然開始響
    pref = createLocalPref({ key, defaultValue: true, ...onOff, fallback: () => LEGACY[kind].read() });
    prefs.set(key, pref);
  }
  return pref;
}

export const readAlertPref = (moduleId: string, kind: AlertKind): boolean => alertPref(moduleId, kind).read();

export const setAlertPref = (moduleId: string, kind: AlertKind, enabled: boolean): void => alertPref(moduleId, kind).save(enabled);

export const useAlertPref = (moduleId: string, kind: AlertKind): boolean => alertPref(moduleId, kind).useValue();

export const anyAlertPref = (moduleIds: readonly string[], kind: AlertKind): boolean => moduleIds.some((id) => readAlertPref(id, kind));

/** 這幾個模組的同一種設定有變動就通知 其他分頁改的也算 */
export function subscribeAlertPrefs(moduleIds: readonly string[], kind: AlertKind, listener: () => void): () => void {
  const unsubscribes = moduleIds.map((id) => alertPref(id, kind).subscribe(listener));
  return () => unsubscribes.forEach((unsubscribe) => unsubscribe());
}

/** 任一模組開著就是 true 伺服器算繪時當成預設的全開 */
export function useAnyAlertPref(moduleIds: readonly string[], kind: AlertKind): boolean {
  // 陣列每次算繪都是新的 用內容當依賴 訂閱才不會一直重建
  const ids = moduleIds.join("\n");
  const subscribe = useCallback((listener: () => void) => subscribeAlertPrefs(ids ? ids.split("\n") : [], kind, listener), [ids, kind]);
  const read = useCallback(() => anyAlertPref(ids ? ids.split("\n") : [], kind), [ids, kind]);
  return useSyncExternalStore(subscribe, read, () => ids !== "");
}
