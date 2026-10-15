"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { Icon } from "@/core/ui/icon";
import { CardHeader } from "@/core/ui/page-header";
import { formatDayShort } from "../../../lib/dates";
import type { Slice } from "../../../lib/ledger";
import { formatTwd } from "../../../lib/money";
import type { MonthKey } from "../../../lib/month";
import { recordsHref, type ExpenseRecord } from "../../dashboard-view";
import { ColorDot } from "../color-dot";
import { prefersReducedMotion } from "../motion/reduced-motion";
import { toggleSelection } from "./chart-focus";
import { DonutChart } from "./donut-chart";

// 只列最近幾筆 其餘到紀錄頁看 整個月的紀錄已經跟頁面送來 點了不必再問伺服器
const RECORD_LIMIT = 8;

/** 照傳進來的順序 新的在前 */
export function recordsForSlice(records: ExpenseRecord[], key: string, limit: number): { shown: ExpenseRecord[]; more: number } {
  const matched = records.filter((record) => record.sliceKey === key);
  return { shown: matched.slice(0, limit), more: Math.max(0, matched.length - limit) };
}

type Scrollable = { scrollIntoView(options: ScrollIntoViewOptions): void };

/**
 * 點了某片才把紀錄捲進畫面 手機上清單常在畫面外
 * Activity 再顯示時 effect 會重跑 沒點過就不捲 頁面才不會自己跳
 */
function createPanelReveal() {
  let requested = false;
  return {
    request() {
      requested = true;
    },
    run(panel: Scrollable | null, reduced: boolean) {
      if (!requested) return;
      requested = false;
      // nearest 是已經看得到就不捲 減少動態效果時直接跳過去
      panel?.scrollIntoView({ block: "nearest", behavior: reduced ? "instant" : "smooth" });
    },
  };
}

type ExpenseDonutCardProps = {
  title: string;
  slices: Slice[];
  total: number;
  totalLabel: string;
  records: ExpenseRecord[];
  /** 例如本月或 9 月 */
  period: string;
  /** 紀錄頁的月份 本月是 null 連結就不帶 month */
  month: MonthKey | null;
};

export function ExpenseDonutCard({ title, slices, total, totalLabel, records, period, month }: ExpenseDonutCardProps) {
  const [selected, setSelected] = useState<string | null>(null);
  const [reveal] = useState(createPanelReveal);
  const headingId = useId();
  const panelId = useId();
  const sectionRef = useRef<HTMLElement>(null);
  // 換月份後選到的分類可能不在這個月 當作沒選
  const selectedSlice = slices.find((slice) => slice.key === selected);
  const selectedKey = selectedSlice?.key ?? null;
  const { shown, more } = selectedSlice ? recordsForSlice(records, selectedSlice.key, RECORD_LIMIT) : { shown: [], more: 0 };

  useEffect(() => {
    reveal.run(selectedKey === null ? null : document.getElementById(`${panelId}-panel`), prefersReducedMotion());
  }, [reveal, selectedKey, panelId]);

  return (
    <section ref={sectionRef} aria-labelledby={headingId} className="card stack @container min-w-0">
      <CardHeader id={headingId} icon={<Icon name="receipt" />}>
        {title}
      </CardHeader>
      <DonutChart
        label={title}
        slices={slices}
        center={{ label: totalLabel, amount: total }}
        selected={selectedKey}
        onSelect={(key) => {
          reveal.request();
          setSelected((current) => toggleSelection(current, key));
        }}
        controls={panelId}
      />
      <p role="status" className="sr-only">
        {selectedSlice ? `列出「${selectedSlice.label}」的 ${shown.length + more} 筆紀錄` : ""}
      </p>
      {/* 這層一直都在 圖例的 aria-controls 才指得到 contents 不佔 stack 的間距 */}
      <div id={panelId} className="contents">
        {selectedSlice && (
          <ExpenseRecordsPanel
            id={`${panelId}-panel`}
            slice={selectedSlice}
            records={shown}
            more={more}
            period={period}
            month={month}
            onClose={() => {
              // 收起鈕跟著清單消失 焦點回到打開它的圖例按鈕 不掉到 body
              sectionRef.current?.querySelector<HTMLButtonElement>('.fin-legend-item[aria-pressed="true"]')?.focus();
              setSelected(null);
            }}
          />
        )}
      </div>
    </section>
  );
}

type ExpenseRecordsPanelProps = {
  id: string;
  slice: Slice;
  records: ExpenseRecord[];
  more: number;
  period: string;
  month: MonthKey | null;
  onClose: () => void;
};

export function ExpenseRecordsPanel({ id, slice, records, more, period, month, onClose }: ExpenseRecordsPanelProps) {
  const titleId = `${id}-title`;
  return (
    // 手機捲進畫面時多留一段 停在右下角的加號按鈕上面 最後一列才不被蓋住
    <section id={id} aria-labelledby={titleId} className="panel-outline fin-reveal stack max-sm:scroll-mb-20">
      {/* 手機上一列也放得下 標題太長時截斷 收起只用圖示 */}
      <header className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <h3 id={titleId} className="flex min-w-0 items-center gap-2 font-semibold text-ink">
            <ColorDot color={slice.color} />
            <span className="truncate">
              {slice.label}・{period}的紀錄
            </span>
          </h3>
          <span className="chip shrink-0 tabular-nums">{records.length + more} 筆</span>
        </div>
        <button type="button" onClick={onClose} aria-label="收起紀錄" className="icon-button">
          <Icon name="x" className="size-4" />
        </button>
      </header>
      <ul className="flex flex-col divide-y divide-line">
        {records.map((record) => (
          <li key={record.id} className="flex min-h-11 items-center gap-3 py-2">
            <span className="w-20 shrink-0 text-sm text-ink-soft tabular-nums">{formatDayShort(record.date)}</span>
            <span className="flex min-w-0 flex-1 flex-col">
              {/* 沒有備註時帳戶名稱就是說明 不重複寫兩次 */}
              <span className="truncate text-ink">{record.note ?? record.accountName}</span>
              {record.note !== null && <span className="truncate text-sm text-ink-soft">{record.accountName}</span>}
            </span>
            {record.recurring && <span className="chip shrink-0">自動</span>}
            <span className="shrink-0 text-right font-semibold text-ink tabular-nums">{formatTwd(record.amount)}</span>
          </li>
        ))}
      </ul>
      {/* 還有沒列出的就到紀錄頁看這個分類 一打開就篩好 */}
      {more > 0 ? (
        <Link href={recordsHref(month, slice.key)} className="link link-block">
          還有 {more} 筆，到紀錄頁看全部
        </Link>
      ) : (
        <Link href={recordsHref(month)} className="link link-block">
          到紀錄頁看這個月的全部紀錄
        </Link>
      )}
    </section>
  );
}
