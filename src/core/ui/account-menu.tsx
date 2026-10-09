"use client";

import Link from "next/link";
import { useEffect, useId, useRef, type FocusEvent, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import { logout } from "../auth/actions";
import { useHeaderMenu } from "./header-menus";
import { Icon, type UiIconName } from "./icon";
import { menuFocusIndex } from "./menu-state";
import { THEME_OPTIONS } from "./theme";
import { useThemePref } from "./theme-sync";

type FocusTarget = "first" | "last";

const menuItems = (menu: HTMLElement | null) => Array.from(menu?.querySelectorAll<HTMLElement>('[role="menuitem"], [role="menuitemradio"]') ?? []);

function focusMenuItem(menu: HTMLElement | null, target: FocusTarget) {
  const items = menuItems(menu);
  items[target === "first" ? 0 : items.length - 1]?.focus();
}

/** 選單裡的連結：點了就收起選單（換頁時也會收，但點同一頁時不會換頁） */
export function AccountMenuLink({ href, icon, children }: { href: string; icon: UiIconName; children: ReactNode }) {
  const { close } = useHeaderMenu("account");
  return (
    <li role="none">
      <Link href={href} role="menuitem" onClick={close} className="menu-item">
        <Icon name={icon} className="size-4" />
        {children}
      </Link>
    </li>
  );
}

/** 導覽列右上角的人像按鈕：手機與電腦都從這裡切換外觀、進帳號設定或登出；帳號名稱與只有站長看得到的項目由伺服器元件讀好傳進來 */
export function AccountMenu({ username, ownerItems }: { username: ReactNode; ownerItems?: ReactNode }) {
  const { expanded, toggle, close, rootRef, buttonRef } = useHeaderMenu("account");
  const menuRef = useRef<HTMLUListElement>(null);
  const pendingFocus = useRef<FocusTarget | null>(null);
  const menuId = useId();
  const labelId = useId();
  const themeLabelId = useId();
  const [theme, setTheme] = useThemePref();

  // 用鍵盤打開時，選單算繪出來才有項目可以聚焦
  useEffect(() => {
    if (!expanded || !pendingFocus.current) return;
    focusMenuItem(menuRef.current, pendingFocus.current);
    pendingFocus.current = null;
  }, [expanded]);

  const openWithFocus = (target: FocusTarget) => {
    if (expanded) {
      focusMenuItem(menuRef.current, target);
      return;
    }
    pendingFocus.current = target;
    toggle();
  };

  const onButtonClick = (event: MouseEvent<HTMLButtonElement>) => {
    // detail 為 0 是鍵盤或報讀器按下的：照選單按鈕的慣例把焦點移到第一項；滑鼠、手指點開不搶焦點
    if (!expanded && event.detail === 0) openWithFocus("first");
    else toggle();
  };

  const onButtonKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    openWithFocus(event.key === "ArrowDown" ? "first" : "last");
  };

  const onMenuKeyDown = (event: KeyboardEvent<HTMLUListElement>) => {
    const items = menuItems(event.currentTarget);
    const next = menuFocusIndex(event.key, items.indexOf(document.activeElement as HTMLElement), items.length);
    if (next === null) return;
    event.preventDefault();
    items[next].focus();
  };

  // Tab 離開選單就收起；relatedTarget 不是元素代表點到沒有焦點的地方，交給點外面的處理
  const onRootBlur = (event: FocusEvent<HTMLDivElement>) => {
    const next = event.relatedTarget;
    if (expanded && next instanceof Node && !event.currentTarget.contains(next)) close();
  };

  return (
    <div ref={rootRef} onBlur={onRootBlur} className="shrink-0 sm:relative">
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={expanded}
        aria-controls={expanded ? menuId : undefined}
        aria-label="帳號"
        title="帳號"
        onClick={onButtonClick}
        onKeyDown={onButtonKeyDown}
        className="btn-ghost btn-sm btn-icon"
      >
        <Icon name="circle-user-round" className="size-[1.125rem]" />
      </button>

      {expanded && (
        <div className="menu-panel">
          <p id={labelId} className="border-b border-line px-3 pt-1.5 pb-2.5 text-[0.8125rem] text-ink-soft">
            已登入：<span className="font-semibold break-all text-ink">{username}</span>
          </p>
          <ul ref={menuRef} id={menuId} role="menu" aria-labelledby={labelId} onKeyDown={onMenuKeyDown} className="flex flex-col gap-1">
            {/* 選了不收起選單，馬上看得到換色的結果 */}
            <li role="none" className="flex flex-col gap-1.5 border-b border-line px-1.5 pt-0.5 pb-2.5">
              <p id={themeLabelId} className="px-1.5 text-[0.8125rem] font-medium text-ink-soft">
                外觀
              </p>
              <div role="group" aria-labelledby={themeLabelId} className="grid grid-cols-3 gap-1">
                {THEME_OPTIONS.map((option) => (
                  <button key={option.id} type="button" role="menuitemradio" aria-checked={theme === option.id} onClick={() => setTheme(option.id)} className="theme-option">
                    <Icon name={option.icon} className="size-4" />
                    {option.label}
                  </button>
                ))}
              </div>
            </li>
            {ownerItems}
            <AccountMenuLink href="/account" icon="settings">
              帳號設定
            </AccountMenuLink>
            <li role="none">
              {/* 送出時才收起：在 click 就卸載表單的話，瀏覽器會取消這次送出 */}
              <form action={logout} onSubmit={close}>
                <button type="submit" role="menuitem" className="menu-item menu-item-danger">
                  <Icon name="log-out" className="size-4" />
                  登出
                </button>
              </form>
            </li>
          </ul>
        </div>
      )}
    </div>
  );
}
