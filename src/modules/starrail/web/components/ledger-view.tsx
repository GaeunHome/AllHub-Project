"use client";

import { useId, useState } from "react";
import { Icon } from "@/core/ui/icon";
import { groupDigits, monthLabel, type Ledger } from "../../lib/ledger";

type LedgerViewProps = { ledgers: Ledger[]; current: string; fetchedLabel: string };

/** 月份切換在瀏覽器裡做：幾個月份的資料已經一起查好 */
export function LedgerView({ ledgers, current, fetchedLabel }: LedgerViewProps) {
  const [month, setMonth] = useState(current);
  const tabsId = useId();
  const ledger = ledgers.find((l) => l.month === month) ?? ledgers[ledgers.length - 1];
  if (!ledger) return null;
  const isCurrent = ledger.month === current;
  const maxSource = Math.max(1, ...ledger.sources.map((s) => s.amount ?? 0));

  return (
    <section aria-labelledby={`${tabsId}-title`} className="stack">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <h3 id={`${tabsId}-title`} className="sr-title">
          開拓月曆
        </h3>
        <span className="chip">
          <Icon name="clock" className="size-3.5" />
          {fetchedLabel} 更新
        </span>
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
        <StatTile label={`${monthLabel(ledger.month)}的星瓊`} icon="sparkles" value={ledger.current.jade} last={ledger.last.jade} rate={ledger.jadeRate} today={isCurrent ? ledger.today.jade : null} />
        <StatTile label={`${monthLabel(ledger.month)}的車票`} icon="train-front" value={ledger.current.passes} last={ledger.last.passes} rate={ledger.passRate} today={isCurrent ? ledger.today.passes : null} />
      </div>

      <div className="sr-panel stack p-5 sm:p-6">
        <h4 className="font-semibold text-ink">星瓊從哪裡來</h4>
        {ledger.sources.length > 0 ? (
          // 長條以最多的那一項為滿格，比例寫在數字旁邊；這份清單本身就是表格：數字兩欄固定寬度、靠右，每一列的長條一樣長
          // 手機上名稱與數字一行、長條在下一行撐滿；寬螢幕四欄排在同一行
          <ul className="flex flex-col gap-3">
            {ledger.sources.map((source, i) => (
              <li
                key={source.id ?? i}
                className="grid grid-cols-[minmax(0,1fr)_3.5rem_2.75rem] items-center gap-x-3 gap-y-1.5 sm:grid-cols-[minmax(0,11rem)_minmax(0,1fr)_4rem_3rem]"
              >
                <span className="col-start-1 row-start-1 truncate text-sm text-ink-soft">{source.name ?? "（未知來源）"}</span>
                <span aria-hidden className="col-span-3 row-start-2 h-2 bg-white/10 sm:col-span-1 sm:col-start-2 sm:row-start-1">
                  <span className="block h-full rounded-r-[4px] bg-linear-to-r from-[#a97b33] to-[#f1d28e]" style={{ width: `${Math.round(((source.amount ?? 0) / maxSource) * 100)}%` }} />
                </span>
                <span className="sr-num col-start-2 row-start-1 text-right text-base font-bold whitespace-nowrap text-ink sm:col-start-3">
                  {source.amount === null ? "—" : groupDigits(source.amount)}
                </span>
                <span className="sr-num col-start-3 row-start-1 text-right text-base whitespace-nowrap text-ink-soft sm:col-start-4">{source.percent !== null ? `${source.percent}%` : ""}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-ink-soft">這個月還沒有星瓊紀錄。</p>
        )}
      </div>
    </section>
  );
}

type StatTileProps = { label: string; icon: "sparkles" | "train-front"; value: number | null; last: number | null; rate: number | null; today: number | null };

/** 這個月的數量，跟上個月比增減幾 %；方向用箭頭加正負號，不只靠顏色 */
function StatTile({ label, icon, value, last, rate, today }: StatTileProps) {
  return (
    <div className="sr-panel flex flex-col gap-3 p-5 sm:p-6">
      <p className="flex items-center gap-2 text-sm font-medium text-ink-soft">
        <Icon name={icon} className="size-4 text-sr-gold" />
        {label}
      </p>
      <p className="sr-num text-5xl leading-none font-bold text-ink">{value === null ? "—" : groupDigits(value)}</p>
      <div className="flex flex-wrap items-center gap-1.5">
        {rate !== null && (
          <span className={rate >= 0 ? "chip chip-success" : "chip chip-danger"}>
            <Icon name={rate >= 0 ? "arrow-up" : "arrow-down"} className="size-3.5" />
            比上個月 {rate > 0 ? "+" : ""}
            {rate}%
          </span>
        )}
        {last !== null && (
          <span className="chip">
            上個月 <span className="sr-num text-[0.8125rem] font-bold">{groupDigits(last)}</span>
          </span>
        )}
        {today !== null && (
          <span className="chip">
            今天 <span className="sr-num text-[0.8125rem] font-bold">{groupDigits(today)}</span>
          </span>
        )}
      </div>
    </div>
  );
}
