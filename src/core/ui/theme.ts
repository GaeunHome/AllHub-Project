import type { UiIconName } from "./icon";

export type ThemePref = "light" | "dark" | "system";

/** 每台裝置各自的設定，存在瀏覽器（createLocalPref 與 <head> 的同步腳本讀同一個 key） */
export const THEME_KEY = "allhub:theme";

export const THEME_OPTIONS: readonly { id: ThemePref; label: string; icon: UiIconName }[] = [
  { id: "light", label: "淺色", icon: "sun" },
  { id: "dark", label: "深色", icon: "moon" },
  { id: "system", label: "跟隨系統", icon: "monitor" },
];

export function parseThemePref(stored: string): ThemePref | undefined {
  return THEME_OPTIONS.find((option) => option.id === stored)?.id;
}

type ThemeRoot = { setAttribute(name: string, value: string): void; removeAttribute(name: string): void };

/** 淺色、深色寫進 data-theme；跟隨系統時拿掉，CSS 改用 prefers-color-scheme，系統切換時不必再跑 JavaScript */
export function applyTheme(root: ThemeRoot, pref: ThemePref): void {
  if (pref === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", pref);
}

// React 接手前就要套用，所以是一段放在 <head> 的同步腳本；只認得淺色、深色，其他值一律當成跟隨系統
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem(${JSON.stringify(THEME_KEY)});if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t)}catch(e){}})()`;
