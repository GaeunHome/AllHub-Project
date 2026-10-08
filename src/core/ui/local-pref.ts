import { useSyncExternalStore } from "react";

type LocalPrefOptions<T> = {
  key: string;
  defaultValue: T;
  /** 認不得存著的值就回 undefined，改用預設值 */
  parse: (stored: string) => T | undefined;
  serialize?: (value: T) => string;
  /** 還沒存過時改用的值（例如沿用舊版的設定），回 undefined 才用 defaultValue；伺服器算繪一律用 defaultValue */
  fallback?: () => T | undefined;
};

export type LocalPref<T> = {
  read(): T;
  save(value: T): void;
  subscribe(listener: () => void): () => void;
  /** 伺服器算繪時讀不到 localStorage，先用預設值，瀏覽器接手後才換成存著的值，避免 hydration 不一致 */
  useValue(): T;
};

/** 每台裝置各自的偏好（存在瀏覽器而不是資料庫）；值只能是字串、數字或布林，useSyncExternalStore 才比得出有沒有變 */
export function createLocalPref<T extends string | number | boolean>({ key, defaultValue, parse, serialize = String, fallback }: LocalPrefOptions<T>): LocalPref<T> {
  const listeners = new Set<() => void>();
  // 隱私模式可能不能用 localStorage，至少在這個分頁裡記得
  let memory: T | undefined;

  const read = (): T => {
    try {
      const stored = localStorage.getItem(key);
      const value = stored === null ? undefined : parse(stored);
      if (value !== undefined) return value;
    } catch {
      // 改用記憶體裡的值
    }
    return memory ?? fallback?.() ?? defaultValue;
  };

  const save = (value: T): void => {
    memory = value;
    try {
      localStorage.setItem(key, serialize(value));
    } catch {
      // 改用記憶體裡的值
    }
    listeners.forEach((listener) => listener());
  };

  const subscribe = (listener: () => void): (() => void) => {
    listeners.add(listener);
    // storage 事件只在其他分頁觸發：別的分頁改了這個設定（或清空）就重讀；key 是 null 代表清空
    const onStorage = (event: Event) => {
      const changed = (event as StorageEvent).key;
      if (changed === null || changed === key) listener();
    };
    window.addEventListener("storage", onStorage);
    return () => {
      listeners.delete(listener);
      window.removeEventListener("storage", onStorage);
    };
  };

  return { read, save, subscribe, useValue: () => useSyncExternalStore(subscribe, read, () => defaultValue) };
}

/** 開關類偏好存成 on／off */
export const onOff = { parse: (stored: string) => (stored === "on" ? true : stored === "off" ? false : undefined), serialize: (value: boolean) => (value ? "on" : "off") };
