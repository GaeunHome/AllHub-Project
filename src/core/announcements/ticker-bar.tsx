"use client";

import Link from "next/link";
import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { setHtmlFlag, useHtmlFlagSync, type HtmlRoot } from "../ui/html-flag";
import { Icon, type UiIconName } from "../ui/icon";
import { createLocalPref } from "../ui/local-pref";
import type { AnnouncementKind } from "../db/schema";
import { ANNOUNCEMENT_KIND_LABELS } from "./rules";
import { TICKER_HIDDEN_ATTRIBUTE, TICKER_KEY, isTickerDismissed, tickerScript, type TickerItem } from "./ticker";

const tickerPref = createLocalPref<string>({ key: TICKER_KEY, defaultValue: "", parse: (stored) => stored });

const KIND_ICONS: Record<AnnouncementKind, UiIconName> = { outage: "circle-alert", maintenance: "wrench", general: "megaphone" };

/** 一秒走 60px 太短的也要 12 秒一輪 字才讀得完 */
const PX_PER_SECOND = 60;
const MIN_SECONDS = 12;

function Items({ items, copy = false }: { items: TickerItem[]; copy?: boolean }) {
  return (
    <ul className="ticker-list" aria-hidden={copy || undefined}>
      {items.map((item) => (
        <li key={item.key}>
          <Link href="/#home-announcements" tabIndex={copy ? -1 : undefined} className="ticker-item">
            <span className="font-semibold">{ANNOUNCEMENT_KIND_LABELS[item.kind]}</span>
            <span>{item.title}</span>
            <span className="tabular-nums">{item.when}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/**
 * 放不下才捲 滑鼠停在上面或焦點在裡面時暫停 減少動態時不捲
 * 關掉記在這個瀏覽器 第一次繪製前就在 html 標好 由 CSS 藏起來
 */
export function TickerBar({ items, frame }: { items: TickerItem[]; frame: string }) {
  const signature = items.map((item) => item.key).join(",");
  const sync = useMemo(() => {
    const keys = signature.split(",");
    return {
      script: tickerScript(keys),
      apply: (root: HtmlRoot) => setHtmlFlag(root, TICKER_HIDDEN_ATTRIBUTE, isTickerDismissed(tickerPref.read(), keys)),
      subscribe: tickerPref.subscribe,
      clear: (root: HtmlRoot) => setHtmlFlag(root, TICKER_HIDDEN_ATTRIBUTE, false),
    };
  }, [signature]);
  const script = useHtmlFlagSync(sync);

  const viewRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [rolling, setRolling] = useState<number | null>(null);
  useLayoutEffect(() => {
    const view = viewRef.current;
    const list = listRef.current?.firstElementChild;
    if (!view || !list) return;
    const measure = () => setRolling(list.scrollWidth > view.clientWidth ? Math.max(MIN_SECONDS, list.scrollWidth / PX_PER_SECOND) : null);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(view);
    observer.observe(list);
    return () => observer.disconnect();
  }, [signature]);

  const [first] = items;
  return (
    <>
      {script}
      <section aria-label="重要公告" data-kind={first.kind} className="ticker">
        <div className={`ticker-frame ${frame}`}>
          <Icon name={KIND_ICONS[first.kind]} className="ticker-icon" />
          <div ref={viewRef} className="ticker-view" data-rolling={rolling === null ? undefined : ""}>
            <div ref={listRef} className="ticker-roll" style={rolling === null ? undefined : ({ "--ticker-seconds": `${rolling}s` } as CSSProperties)}>
              <Items items={items} />
              {rolling !== null && <Items items={items} copy />}
            </div>
          </div>
          <button type="button" aria-label="關閉跑馬燈" title="關閉跑馬燈" onClick={() => tickerPref.save(signature)} className="ticker-close">
            <Icon name="x" className="size-4" />
          </button>
        </div>
      </section>
    </>
  );
}
