import { useSyncExternalStore } from "react";

// 伺服器算繪與 hydration 時一律用伺服器的值 之後才換成瀏覽器的 兩邊不會不一致
const noSubscribe = () => () => {};

/** 只有瀏覽器讀得到的值 伺服器與 hydration 時是 serverValue 讀的函式要回傳不會變的值 */
export function useClientValue<T>(read: () => T, serverValue: T): T {
  return useSyncExternalStore(noSubscribe, read, () => serverValue);
}

/** hydration 完成之後才是 true */
export const useHydrated = (): boolean => useClientValue(() => true, false);
