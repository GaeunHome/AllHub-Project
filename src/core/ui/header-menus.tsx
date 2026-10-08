"use client";

import { usePathname } from "next/navigation";
import { createContext, Suspense, use, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { closeMenu, toggleMenu } from "./menu-state";

export type HeaderMenuId = "notifications" | "account";

type HeaderMenusValue = {
  open: HeaderMenuId | null;
  toggle(id: HeaderMenuId): void;
  close(id: HeaderMenuId): void;
};

const HeaderMenusContext = createContext<HeaderMenusValue | null>(null);

/** 導覽列右上角的下拉面板（鈴鐺、帳號選單）共用開關：同時只開一個，換頁時一起收起 */
export function HeaderMenus({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState<HeaderMenuId | null>(null);
  const toggle = useCallback((id: HeaderMenuId) => setOpen((current) => toggleMenu(current, id)), []);
  const close = useCallback((id: HeaderMenuId) => setOpen((current) => closeMenu(current, id)), []);
  const closeAll = useCallback(() => setOpen(null), []);

  // 換到別的版面（例如被導到登入頁）時 Next 用 Activity 把導覽列藏起來而不卸載，回來時面板不該還開著
  useLayoutEffect(() => closeAll, [closeAll]);

  const value = useMemo<HeaderMenusValue>(() => ({ open, toggle, close }), [open, toggle, close]);

  return (
    <HeaderMenusContext value={value}>
      {children}
      {/* 觀看頁是動態路由，預先算繪時還不知道網址，usePathname 要包在 Suspense 裡 */}
      <Suspense fallback={null}>
        <CloseOnNavigate onNavigate={closeAll} />
      </Suspense>
    </HeaderMenusContext>
  );
}

/** 上一頁、下一頁或程式換頁時收起面板；第一次算繪不算換頁，Suspense 晚一點完成時才不會關掉剛打開的面板 */
function CloseOnNavigate({ onNavigate }: { onNavigate: () => void }) {
  const pathname = usePathname();
  const previous = useRef(pathname);

  useEffect(() => {
    if (previous.current === pathname) return;
    previous.current = pathname;
    onNavigate();
  }, [pathname, onNavigate]);

  return null;
}

/** 單一面板的開關：點面板外面或按 Esc 就收起，Esc 收起後焦點回到按鈕；rootRef 要包住按鈕與面板 */
export function useHeaderMenu(id: HeaderMenuId) {
  const menus = use(HeaderMenusContext);
  if (!menus) throw new Error("useHeaderMenu 要放在 <HeaderMenus> 裡面");
  const { open, toggle: toggleMenuById, close: closeMenuById } = menus;
  const expanded = open === id;
  const toggle = useCallback(() => toggleMenuById(id), [toggleMenuById, id]);
  const close = useCallback(() => closeMenuById(id), [closeMenuById, id]);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!expanded) return;
    const closeOutside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) close();
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      close();
      buttonRef.current?.focus();
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [expanded, close]);

  return { expanded, toggle, close, rootRef, buttonRef };
}
