"use client";

import { useLayoutEffect } from "react";
import { createLocalPref } from "./local-pref";
import { THEME_KEY, applyTheme, parseThemePref, type ThemePref } from "./theme";

const themePref = createLocalPref<ThemePref>({ key: THEME_KEY, defaultValue: "system", parse: parseThemePref });

/** 人像選單用：選了就存起來並立刻套用；同一台裝置的其他分頁由 ThemeSync 跟上 */
export function useThemePref(): [ThemePref, (pref: ThemePref) => void] {
  const save = (pref: ThemePref) => {
    themePref.save(pref);
    applyTheme(document.documentElement, pref);
  };
  return [themePref.useValue(), save];
}

/** 放在根 layout：開發模式的 StrictMode 重新掛載時會清掉 <head> 腳本設的 data-theme，這裡在繪製前補回；也跟著其他分頁的切換 */
export function ThemeSync() {
  useLayoutEffect(() => {
    const apply = () => applyTheme(document.documentElement, themePref.read());
    apply();
    return themePref.subscribe(apply);
  }, []);
  return null;
}
