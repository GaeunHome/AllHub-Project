"use client";

import { useRef, useState, type ReactNode } from "react";
import { Icon } from "@/core/ui/icon";
import { pageCount, pageNumbers, pageSlice } from "../paging";

// 從下面的頁碼換頁時清單開頭可能捲到導覽列底下 跟 scroll-padding-top 一樣留 6rem
const HEADER_PX = 96;

/** 在瀏覽器換頁 不多問伺服器 換條件時外面用 key 重來 回到第一頁 */
export function ResultPages({ items, listClassName }: { items: ReactNode[]; listClassName: string }) {
  const [page, setPage] = useState(1);
  const list = useRef<HTMLUListElement>(null);
  const total = pageCount(items.length);
  const go = (next: number) => {
    if (next < 1 || next > total || next === page) return;
    setPage(next);
    if (list.current && list.current.getBoundingClientRect().top < HEADER_PX) list.current.scrollIntoView({ block: "start" });
  };
  return (
    <>
      <ul ref={list} className={listClassName}>
        {pageSlice(items, page)}
      </ul>
      {total > 1 && (
        <nav aria-label="班次的頁數" className="trn-pages">
          {/* aria-disabled 不用 disabled 按到頭時焦點才不會掉到 body */}
          <button type="button" aria-label="上一頁" aria-disabled={page === 1} onClick={() => go(page - 1)} className="btn-secondary btn-sm btn-icon">
            <Icon name="chevron-left" className="size-4" />
          </button>
          <span className="trn-page-numbers">
            {pageNumbers(page, total).map((number, index) =>
              number === "gap" ? (
                <span key={`gap-${index}`} aria-hidden="true" className="trn-page-gap">
                  …
                </span>
              ) : (
                <button key={number} type="button" aria-label={`第 ${number} 頁`} aria-current={number === page ? "page" : undefined} onClick={() => go(number)} className="trn-page">
                  {number}
                </button>
              ),
            )}
          </span>
          <span className="trn-page-count" aria-hidden="true">
            {page} / {total}
          </span>
          <button type="button" aria-label="下一頁" aria-disabled={page === total} onClick={() => go(page + 1)} className="btn-secondary btn-sm btn-icon">
            <Icon name="chevron-right" className="size-4" />
          </button>
        </nav>
      )}
    </>
  );
}
