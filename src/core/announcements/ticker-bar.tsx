"use client";

import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { setHtmlFlag, useHtmlFlagSync, type HtmlRoot } from "../ui/html-flag";
import { Icon } from "../ui/icon";
import { createLocalPref } from "../ui/local-pref";
import { ANNOUNCEMENT_KIND_ICONS } from "./kind-icons";
import { ANNOUNCEMENT_KIND_LABELS } from "./rules";
import { TICKER_HIDDEN_ATTRIBUTE, TICKER_KEY, isTickerDismissed, tickerScript, tickerSeconds, type TickerItem } from "./ticker";

const tickerPref = createLocalPref<string>({ key: TICKER_KEY, defaultValue: "", parse: (stored) => stored });

/** 多則接成一條 使用者選的 每一則前面是自己種類的圖示 */
function Items({ items, copy = false }: { items: TickerItem[]; copy?: boolean }) {
  return (
    <ul className="ticker-list" aria-hidden={copy || undefined}>
      {items.map((item) => (
        <li key={item.key} data-kind={item.kind} className="ticker-item">
          <Icon name={ANNOUNCEMENT_KIND_ICONS[item.kind]} className="ticker-item-icon" />
          <span className="font-semibold">{ANNOUNCEMENT_KIND_LABELS[item.kind]}</span>
          <span>{item.title}</span>
          <span className="tabular-nums">{item.when}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * 使用者要的 不放連結 不管長短都一直跑 滑鼠停在上面時暫停 減少動態時不跑
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

  // 一份清單至少跟畫面一樣寬 量到寬度後才開始跑 速度才不會中途跳
  const listRef = useRef<HTMLDivElement>(null);
  const [rolling, setRolling] = useState<number | null>(null);
  useLayoutEffect(() => {
    const list = listRef.current?.firstElementChild;
    if (!list) return;
    const measure = () => setRolling(tickerSeconds(list.scrollWidth));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(list);
    return () => observer.disconnect();
  }, [signature]);

  const [first] = items;
  return (
    <>
      {script}
      <section aria-label="重要公告" data-kind={first.kind} className="ticker">
        <div className={`ticker-frame ${frame}`}>
          <div className="ticker-view" data-rolling={rolling === null ? undefined : ""}>
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
