"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLayoutEffect, useRef, type Ref, type RefObject } from "react";
import { pageModules, type ModuleInfo } from "../module";
import { useNotificationCenter } from "../notifications/center";
import { CountBadge } from "./count-badge";
import { Icon } from "./icon";

export type NavModule = Pick<ModuleInfo, "id" | "name" | "href" | "icon" | "accent" | "notifies" | "homeOnly">;

function currentOf(href: string, pathname: string | null): "page" | "true" | undefined {
  if (pathname === href) return "page";
  if (pathname?.startsWith(`${href}/`)) return "true";
  return undefined;
}

type NavView = { scrollLeft: number; width: number; endInset: number };

/** 讓目前這頁的膠囊整個看得到要捲到哪 右邊留淡出的寬度 已經看得到就不動 */
function navScrollLeft({ start, end }: { start: number; end: number }, { scrollLeft, width, endInset }: NavView): number {
  const visible = width - endInset;
  if (start < scrollLeft || end - start > visible) return start;
  if (end > scrollLeft + visible) return end - visible;
  return scrollLeft;
}

/** 只改導覽列自己的 scrollLeft 用 scrollIntoView 可能連整頁一起上下捲 */
function revealCurrent(list: HTMLUListElement | null) {
  const nav = list?.parentElement;
  const current = list?.querySelector<HTMLElement>("[aria-current]");
  if (!list || !nav || !current) return;
  const navBox = nav.getBoundingClientRect();
  const box = current.getBoundingClientRect();
  const start = box.left - navBox.left + nav.scrollLeft;
  // 右緣淡出的寬度就是清單末端的留白 見 globals.css 的 .nav-scroll
  const endInset = Number.parseFloat(getComputedStyle(list).paddingInlineEnd) || 0;
  const next = navScrollLeft({ start, end: start + box.width }, { scrollLeft: nav.scrollLeft, width: nav.clientWidth, endInset });
  if (next !== nav.scrollLeft) nav.scrollLeft = next;
}

/**
 * 橫捲的膠囊列 換頁或寬度改變時把目前那一個捲進畫面
 * list 的父層是會捲的外框 用 layout effect 在繪製前就捲好 不會先閃一下
 */
export function useRevealCurrent(listRef: RefObject<HTMLUListElement | null>, current: unknown) {
  useLayoutEffect(() => {
    const list = listRef.current;
    revealCurrent(list);
    const nav = list?.parentElement;
    if (!list || !nav || typeof ResizeObserver === "undefined") return;
    // 字型載入後膠囊變寬 或轉向與右邊變寬讓外框變窄時再對一次
    const observer = new ResizeObserver(() => revealCurrent(list));
    observer.observe(list);
    observer.observe(nav);
    return () => observer.disconnect();
  }, [listRef, current]);
}

export function NavLinkList({ modules, pathname, listRef }: { modules: NavModule[]; pathname: string | null; listRef?: Ref<HTMLUListElement> }) {
  const { feed } = useNotificationCenter();

  return (
    // w-max 讓清單照內容的寬度 末端的留白才算進捲動範圍
    <ul ref={listRef} className="flex w-max items-center gap-1 sm:gap-1.5">
      {pageModules(modules).map((m) => {
        const current = currentOf(m.href, pathname);
        const unread = feed.unread.byModule[m.id] ?? 0;
        return (
          // 放不下時整排橫捲 膠囊不縮名稱不換行
          // not-sr-only 會把 white-space 改回 normal 所以寬螢幕再指定一次
          <li key={m.id} className="shrink-0">
            <Link href={m.href} data-accent={m.accent} aria-current={current} className="nav-pill relative">
              <Icon src={m.icon} />
              {/* 手機上只留圖示 名稱給報讀器 模組變多也擠得進一行 */}
              <span className="sr-only whitespace-nowrap sm:not-sr-only sm:whitespace-nowrap">{m.name}</span>
              {/* 手機上疊在圖示右上角 放在行內會撐寬膠囊 最後一個模組就被擠出畫面 */}
              <CountBadge count={unread} className="max-sm:absolute max-sm:-top-1 max-sm:-right-1" />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export function NavLinks({ modules }: { modules: NavModule[] }) {
  const pathname = usePathname();
  const listRef = useRef<HTMLUListElement>(null);
  // 換頁後把目前這頁的膠囊捲進畫面 手機上常被擠到右邊看不到
  useRevealCurrent(listRef, pathname);
  return <NavLinkList modules={modules} pathname={pathname} listRef={listRef} />;
}
