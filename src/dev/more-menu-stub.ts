import { createElement, type ReactNode } from "react";
import { textOf } from "./test-helpers";

// 用 vi.mock 把 @/core/ui/more-menu 換成這個檔案
// 真的選單關著時不算繪項目 換掉才看得到每一個 按鈕本身不畫

export function MoreMenu({ label, children }: { label: string; children?: ReactNode }) {
  return createElement("more-menu", { "data-menu": label }, children);
}

const MENU = /<more-menu data-menu="([^"]*)">([\s\S]*?)<\/more-menu>/g;

/** label 是這個字的選單裡面的 HTML 沒有這個選單時是空字串 */
export function menuOf(html: string, label: string): string {
  return [...html.matchAll(MENU)].find(([, name]) => textOf(name) === label)?.[2] ?? "";
}

/** 拿掉所有選單後的 HTML 也就是列上直接看得到的部分 */
export const outsideMenus = (html: string): string => html.replace(MENU, "");
