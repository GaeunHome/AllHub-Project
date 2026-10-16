"use client";

import { useId, useState } from "react";
import { Icon } from "@/core/ui/icon";
import { groupDigits, monthLabel, type Ledger } from "../../lib/ledger";

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
        <MonthFigure label={`${monthLabel(ledger.month)}的星瓊`} icon="sparkles" value={ledger.current.jade} today={isCurrent ? ledger.today.jade : null} />
        <MonthFigure label={`${monthLabel(ledger.month)}的車票`} icon="train-front" value={ledger.current.passes} today={isCurrent ? ledger.today.passes : null} />
      </div>

      <div className="sr-panel">
        <h4 className="card-row font-semibold text-ink">星瓊來源</h4>
        {ledger.sources.length > 0 ? (
          // 數字兩欄固定寬度靠右 每列的數字對齊
          <ul className="divide-y divide-line border-t border-line">
            {ledger.sources.map((source, i) => (
              <li key={source.id ?? i} className="card-row grid grid-cols-[minmax(0,1fr)_auto_3rem] items-center gap-x-4">
                <span className="truncate text-ink">{source.name ?? "（未知來源）"}</span>
                <span className="sr-num text-right text-base font-semibold text-ink">{source.amount === null ? "—" : groupDigits(source.amount)}</span>
                <span className="sr-num text-right text-base text-ink-soft">{source.percent !== null ? `${source.percent}%` : ""}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="card-row border-t border-line text-ink-soft">這個月還沒有星瓊紀錄。</p>
        )}
      </div>
    </section>
  );
}

type MonthFigureProps = { label: string; icon: "sparkles" | "train-front"; value: number | null; today: number | null };

/** 只有這個月的總數 本月再加一行今天拿到的 */
function MonthFigure({ label, icon, value, today }: MonthFigureProps) {
  return (
    <div className="sr-panel flex flex-col gap-3 p-5 sm:p-6">
      <p className="flex items-center gap-2 text-sm font-medium text-ink-soft">
        <Icon name={icon} className="size-4 text-sr-gold" />
        {label}
      </p>
      <p className="sr-num text-5xl leading-none font-bold text-ink">{value === null ? "—" : groupDigits(value)}</p>
      {today !== null && (
        <p className="text-sm text-ink-soft">
          今日已獲得 <span className="sr-num text-base font-semibold text-ink">{groupDigits(today)}</span>
        </p>
      )}
    </div>
  );
}
