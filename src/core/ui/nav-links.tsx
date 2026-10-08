"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ModuleInfo } from "../module";
import { useNotificationCenter } from "../notifications/center";
import { Icon } from "./icon";

export type NavModule = Pick<ModuleInfo, "id" | "name" | "href" | "icon" | "accent" | "notifies">;

function currentOf(href: string, pathname: string | null): "page" | "true" | undefined {
  if (pathname === href) return "page";
  if (pathname?.startsWith(`${href}/`)) return "true";
  return undefined;
}

export function NavLinkList({ modules, pathname }: { modules: NavModule[]; pathname: string | null }) {
  const { feed } = useNotificationCenter();

  return (
    <ul className="flex items-center gap-1 sm:gap-1.5">
      {modules.map((m) => {
        const current = currentOf(m.href, pathname);
        const unread = feed.unread.byModule[m.id] ?? 0;
        return (
          <li key={m.id}>
            <Link href={m.href} data-accent={m.accent} aria-current={current} className="nav-pill relative">
              {m.icon && <Icon src={m.icon} />}
              {/* 手機上只留圖示（名稱給報讀器），模組變多也擠得進一行；目前這頁靠底色標示 */}
              <span className={m.icon ? "sr-only sm:not-sr-only" : undefined}>{m.name}</span>
              {/* 手機上疊在圖示右上角：放在行內會把膠囊撐寬，最後一個模組就被擠出畫面 */}
              {unread > 0 && (
                <span className="count-badge max-sm:absolute max-sm:-top-1 max-sm:-right-1">
                  {unread > 99 ? "99+" : unread}
                  <span className="sr-only"> 則未讀</span>
                </span>
              )}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export function NavLinks({ modules }: { modules: NavModule[] }) {
  return <NavLinkList modules={modules} pathname={usePathname()} />;
}
