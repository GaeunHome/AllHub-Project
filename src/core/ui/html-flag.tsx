import { useLayoutEffect, useSyncExternalStore, type ReactElement } from "react";

// 存在瀏覽器的偏好標在 html 的屬性上 樣式依它排版 伺服器讀不到偏好
// 整頁載入時靠同步腳本 站內換頁時靠 layout effect 第一次繪製就是對的樣子

export type HtmlRoot = { setAttribute(name: string, value: string): void; removeAttribute(name: string): void };

/** 存著的值是 value 時標上 attribute 讀不到 localStorage 時什麼都不做 */
export const htmlFlagScript = (key: string, value: string, attribute: string): string =>
  `(function(){try{if(localStorage.getItem(${JSON.stringify(key)})===${JSON.stringify(value)})document.documentElement.setAttribute(${JSON.stringify(attribute)},"")}catch(e){}})()`;

export function setHtmlFlag(root: HtmlRoot, attribute: string, on: boolean): void {
  if (on) root.setAttribute(attribute, "");
  else root.removeAttribute(attribute);
}

const noSubscribe = () => () => {};

/** apply 照現在的偏好標上或拿掉 clear 一律拿掉 都要是固定的函式 */
type HtmlFlagSync = { script: string; apply: (root: HtmlRoot) => void; subscribe: (listener: () => void) => () => void; clear: (root: HtmlRoot) => void };

/** 放在用到屬性的區塊之前 回傳要畫出來的同步腳本 */
export function useHtmlFlagSync({ script, apply, subscribe, clear }: HtmlFlagSync): ReactElement | null {
  // 伺服器算繪與 hydration 時是 true 只有整頁載入時才需要腳本
  // 瀏覽器端產生的 script 不會執行 React 還會警告
  const serverRendered = useSyncExternalStore(noSubscribe, () => false, () => true);

  // 站內換頁時在繪製前標好 之後跟著偏好更新 其他分頁改的也算
  // 藏起來或卸載時拿掉 屬性才不會留到別頁
  useLayoutEffect(() => {
    const root = document.documentElement;
    const sync = () => apply(root);
    sync();
    const unsubscribe = subscribe(sync);
    return () => {
      unsubscribe();
      clear(root);
    };
  }, [apply, subscribe, clear]);

  return serverRendered ? <script dangerouslySetInnerHTML={{ __html: script }} /> : null;
}
