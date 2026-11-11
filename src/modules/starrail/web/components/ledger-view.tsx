"use client";

import { useId, useState } from "react";
import { groupDigits } from "@/core/number";
import { Icon } from "@/core/ui/icon";
import { monthLabel, type Ledger } from "../../lib/ledger";
import { shareOfMax } from "../chart-scale";

type LedgerViewProps = { ledgers: Ledger[]; current: string; fetchedLabel: string };

/** 幾個月的資料已經一起查好 月份切換在瀏覽器裡做 */
export function LedgerView({ ledgers, current, fetchedLabel }: LedgerViewProps) {
  const [month, setMonth] = useState(current);
  const tabsId = useId();
  const ledger = ledgers.find((l) => l.month === month) ?? ledgers[ledgers.length - 1];
  if (!ledger) return null;
  // 今天拿到的只有本月才有意義
  const isCurrent = ledger.month === current;

  return (
    <section aria-labelledby={`${tabsId}-title`} className="stack">
      {/* 至少 44px 跟並排的終局戰績標題列一樣高 兩邊標題才在同一條線上 */}
      <div className="flex min-h-11 flex-wrap items-center gap-x-4 gap-y-3">
        <h3 id={`${tabsId}-title`} className="sr-title">
          開拓月曆
        </h3>
        <span className="text-sm text-ink-soft">{fetchedLabel} 更新</span>
        {ledgers.length > 1 && (
          <div role="tablist" aria-label="月份" className="flex sm:ml-auto">
            {ledgers.map((l) => (
              <button key={l.month} type="button" role="tab" aria-selected={l.month === ledger.month} onClick={() => setMonth(l.month)} className="sr-tab">
                <span className="sr-num text-base font-bold">{Number(l.month.slice(4))}</span>&nbsp;月
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <MonthCard label={`${monthLabel(ledger.month)}的星瓊`} chart="最近三個月的星瓊" icon="sparkles" value={ledger.current.jade} today={isCurrent ? ledger.today.jade : null} ledgers={ledgers} selected={ledger.month} pick={(l) => l.current.jade} />
        <MonthCard label={`${monthLabel(ledger.month)}的車票`} chart="最近三個月的車票" icon="train-front" value={ledger.current.passes} today={isCurrent ? ledger.today.passes : null} ledgers={ledgers} selected={ledger.month} pick={(l) => l.current.passes} />
      </div>
      <SourceBars sources={ledger.sources} />
    </section>
  );
}

type MonthCardProps = {
  label: string;
  /** 直條圖給報讀器的名稱 */
  chart: string;
  icon: "sparkles" | "train-front";
  value: number | null;
  today: number | null;
  ledgers: Ledger[];
  selected: string;
  pick: (ledger: Ledger) => number | null;
};

/** 左邊是這個月的大數字 右邊是最近三個月的直條 選到的月份強調 其他淡一點 */
function MonthCard({ label, chart, icon, value, today, ledgers, selected, pick }: MonthCardProps) {
  const values = ledgers.map(pick);
  const heights = shareOfMax(values);
  return (
    <div className="sr-panel flex flex-wrap items-end justify-between gap-x-6 gap-y-4 p-5 sm:p-6">
      <div className="flex flex-col gap-3">
        <p className="flex items-center gap-2 text-sm font-semibold text-ink">
          <Icon name={icon} className="size-4 text-sr-gold" />
          {label}
        </p>
        <p className="sr-num text-5xl leading-none font-bold text-ink">{value === null ? "—" : groupDigits(value)}</p>
        {today !== null && (
          <p className="text-sm text-ink">
            今天 <span className="sr-num text-base font-bold text-[var(--sr-gold-ink)]">+{groupDigits(today)}</span>
          </p>
        )}
      </div>
      {ledgers.length > 1 && (
        <figure aria-label={chart} className="sr-month-chart">
          <ol className="sr-month-cols">
            {ledgers.map((l, i) => (
              <li key={l.month} data-selected={l.month === selected ? "" : undefined}>
                <span className="sr-month-value sr-num">{values[i] === null ? "—" : groupDigits(values[i])}</span>
                <span aria-hidden className="sr-month-track">
                  <span className="sr-month-bar" style={{ height: `${heights[i]}%` }} />
                </span>
                <span className="sr-month-name">{Number(l.month.slice(4))} 月</span>
              </li>
            ))}
          </ol>
        </figure>
      )}
    </div>
  );
}

/** 由多到少一項一條橫條 只用一種金色 最多的那一項最長 數量與百分比寫在旁邊 */
function SourceBars({ sources }: { sources: Ledger["sources"] }) {
  const widths = shareOfMax(sources.map((source) => source.amount));
  return (
    <figure aria-label="星瓊來源" className="sr-panel">
      <figcaption className="card-row font-semibold text-ink">星瓊來源</figcaption>
      {sources.length > 0 ? (
        <ol className="sr-source-list">
          {sources.map((source, i) => (
            <li key={source.id ?? i} className="sr-source-row">
              <span className="sr-source-name">{source.name ?? "（未知來源）"}</span>
              <span aria-hidden className="sr-source-track">
                <span className="sr-source-bar" style={{ width: `${widths[i]}%` }} />
              </span>
              <span className="sr-source-amount sr-num">{source.amount === null ? "—" : groupDigits(source.amount)}</span>
              <span className="sr-source-percent sr-num">{source.percent !== null ? `${source.percent}%` : ""}</span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="card-row border-t border-line text-ink">這個月還沒有星瓊紀錄。</p>
      )}
    </figure>
  );
}
