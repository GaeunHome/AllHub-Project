import { createLocalPref, onOff } from "@/core/ui/local-pref";
import { SETUP_STEPS, parseSkippedSteps, serializeSkippedSteps, type SetupStep } from "../../../lib/setup";

// 開始設定與怎麼用的收起和略過存在瀏覽器
// 伺服器讀不到 所以畫面兩種都畫 由 html 上的屬性決定顯示哪一種 第一次繪製前就標好

const SETUP_COLLAPSED_KEY = "allhub:savings:setup-collapsed";
const SETUP_SKIPPED_KEY = "allhub:savings:setup-skipped";
const HOW_TO_COLLAPSED_KEY = "allhub:savings:how-to-collapsed";

export const setupCollapsedPref = createLocalPref<boolean>({ key: SETUP_COLLAPSED_KEY, defaultValue: false, ...onOff });
export const setupSkippedPref = createLocalPref<string>({ key: SETUP_SKIPPED_KEY, defaultValue: "", parse: (stored) => serializeSkippedSteps(parseSkippedSteps(stored)) });
export const howToCollapsedPref = createLocalPref<boolean>({ key: HOW_TO_COLLAPSED_KEY, defaultValue: false, ...onOff });

/** globals.css 依這幾個屬性排 */
export const SETUP_ATTRIBUTE = "data-fin-setup";
export const SKIP_ATTRIBUTE = "data-fin-skip";
export const HOW_TO_ATTRIBUTE = "data-fin-how-to";

type Root = { setAttribute(name: string, value: string): void; removeAttribute(name: string): void };

export type OverviewPrefs = { setupCollapsed: boolean; skipped: SetupStep[]; howToCollapsed: boolean };

export const readOverviewPrefs = (): OverviewPrefs => ({
  setupCollapsed: setupCollapsedPref.read(),
  skipped: parseSkippedSteps(setupSkippedPref.read()),
  howToCollapsed: howToCollapsedPref.read(),
});

/**
 * pending 是還沒做的步驟 hidden 是打開這一頁時就都略過了 整張不出現
 * 這一頁還開著時略過最後一步不藏 焦點才不會掉到不見的按鈕上
 */
export function applyOverviewPrefs(root: Root, prefs: OverviewPrefs, hidden: boolean): void {
  const set = (name: string, value: string | null) => (value === null ? root.removeAttribute(name) : root.setAttribute(name, value));
  set(SETUP_ATTRIBUTE, hidden ? "hidden" : prefs.setupCollapsed ? "collapsed" : null);
  set(SKIP_ATTRIBUTE, prefs.skipped.length === 0 ? null : prefs.skipped.join(" "));
  set(HOW_TO_ATTRIBUTE, prefs.howToCollapsed ? "collapsed" : null);
}

export function clearOverviewPrefs(root: Root): void {
  for (const name of [SETUP_ATTRIBUTE, SKIP_ATTRIBUTE, HOW_TO_ATTRIBUTE]) root.removeAttribute(name);
}

/** 整頁載入時放在總覽最前面的同步腳本 跟 applyOverviewPrefs 做一樣的事 */
export function overviewPrefsScript(pending: readonly SetupStep[]): string {
  const json = JSON.stringify;
  return `(function(){try{var d=document.documentElement,l=localStorage,p=${json(pending)},a=(l.getItem(${json(SETUP_SKIPPED_KEY)})||"").split(","),s=${json(SETUP_STEPS)}.filter(function(x){return a.indexOf(x)>=0});if(s.length)d.setAttribute(${json(SKIP_ATTRIBUTE)},s.join(" "));if(p.length&&p.every(function(x){return s.indexOf(x)>=0}))d.setAttribute(${json(SETUP_ATTRIBUTE)},"hidden");else if(l.getItem(${json(SETUP_COLLAPSED_KEY)})==="on")d.setAttribute(${json(SETUP_ATTRIBUTE)},"collapsed");if(l.getItem(${json(HOW_TO_COLLAPSED_KEY)})==="on")d.setAttribute(${json(HOW_TO_ATTRIBUTE)},"collapsed")}catch(e){}})()`;
}
