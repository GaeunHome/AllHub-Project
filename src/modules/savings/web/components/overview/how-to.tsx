"use client";

import { useId, useRef } from "react";
import { Icon } from "@/core/ui/icon";
import { howToCollapsedPref } from "./overview-prefs";

/** 一行說明平常怎麼用 收起後留一個按鈕可以再打開 樣子由 html 上的屬性決定 */
export function HowTo() {
  const textId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const toggle = (collapsed: boolean) => {
    howToCollapsedPref.save(collapsed);
    rootRef.current?.querySelector<HTMLElement>(collapsed ? "[data-how-to-expand]" : "[data-how-to-collapse]")?.focus();
  };

  return (
    <div ref={rootRef} className="fin-how-to">
      <div id={textId} className="fin-how-to-open notice items-center">
        <Icon name="lightbulb" />
        <p className="min-w-0 flex-1 text-ink">
          花錢可以隨手記一筆；不想每筆都記，月底照銀行 App 按「更新餘額」對齊。每個月照「這個月要做的事」做完就好。
        </p>
        <button type="button" data-how-to-collapse aria-expanded="true" aria-controls={textId} onClick={() => toggle(true)} className="btn-ghost btn-sm shrink-0">
          收起
        </button>
      </div>
      <button type="button" data-how-to-expand aria-expanded="false" aria-controls={textId} onClick={() => toggle(false)} className="fin-how-to-closed btn-ghost btn-sm">
        <Icon name="lightbulb" className="size-4" />
        怎麼用
      </button>
    </div>
  );
}
