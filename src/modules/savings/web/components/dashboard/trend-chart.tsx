"use client";

import Link from "next/link";
import { useId, useState, type CSSProperties, type PointerEvent } from "react";
import { CardHeader } from "@/core/ui/page-header";
import { formatTwd } from "../../../lib/money";
import { formatMonth, formatMonthShort, type MonthKey } from "../../../lib/month";
import { scalePercent, type NiceScale } from "../../chart-geometry";
import { monthRecordsHref } from "../../paths";
import { axisLabels, flowChart, readoutIndex, type FlowPoint } from "./trend-model";

type TrendChartProps = {
  /** 由舊到新最多 12 個月 剛開始用時比較少 */
  points: FlowPoint[];
  /** 台北時間的這個月 連到紀錄頁時不帶月份 */
  current: MonthKey;
};

const onlyMouse = (handler: () => void) => (event: PointerEvent) => {
  if (event.pointerType === "mouse") handler();
};

/** 只有收入與支出 每個月是一個連結 點了到紀錄頁看那個月 */
export function TrendChart({ points, current }: TrendChartProps) {
  const [hover, setHover] = useState<number | null>(null);
  const [focus, setFocus] = useState<number | null>(null);
  const headingId = useId();
  const active = readoutIndex(points, { hover, focus });
  const chart = flowChart(points);
  const columns = { gridTemplateColumns: `repeat(${points.length}, minmax(0, 1fr))` } as CSSProperties;

  return (
    <section aria-labelledby={headingId} className="card stack @container min-w-0">
      <CardHeader id={headingId}>每月收支</CardHeader>

      <Readout point={active === null ? null : points[active]} />

      <div className="fin-chart">
        <Ticks scale={chart.scale} />
        <div className="fin-chart-plot">
          <div className="fin-chart-grid" aria-hidden="true">
            {chart.scale.ticks.map((tick) => (
              <span key={tick} data-zero={tick === 0 ? "" : undefined} style={{ bottom: `${scalePercent(tick, chart.scale)}%` }} />
            ))}
          </div>
          {active !== null && <span className="fin-chart-band" aria-hidden="true" style={{ left: `${(active / points.length) * 100}%`, width: `${100 / points.length}%` }} />}
          {chart.empty ? (
            <p className="fin-chart-empty">還沒有收入或支出</p>
          ) : (
            <div className="fin-bars" aria-hidden="true" style={columns}>
              {chart.columns.map((column) => (
                <div key={column.month} className="fin-bar-group">
                  <span className="fin-bar fin-bar-income" style={{ height: `${column.incomeHeight}%` }} />
                  <span className="fin-bar fin-bar-expense" style={{ height: `${column.expenseHeight}%` }} />
                </div>
              ))}
            </div>
          )}
        </div>
        <ol className="fin-chart-months" aria-hidden="true" style={columns}>
          {points.map((point, i) => (
            <li key={point.month} data-current={point.month === current ? "" : undefined}>
              {/* 卡片太窄時只寫數字 才不會擠成兩行 */}
              <span className="@sm:hidden">{Number(point.month.slice(5, 7))}</span>
              <span className="hidden @sm:inline">{formatMonthShort(point.month)}</span>
              {(i === 0 || point.month.endsWith("-01")) && <span className="block">{point.month.slice(0, 4)}</span>}
            </li>
          ))}
        </ol>
        {/* 疊在圖與月份上面 整欄都能點 手機上一欄只有 20 幾 px 寬 */}
        <ol className="fin-chart-hits" style={columns}>
          {points.map((point, i) => (
            <li key={point.month} className="flex">
              <Link
                href={monthRecordsHref(point.month, current)}
                aria-label={`${formatMonth(point.month)}：收入 ${formatTwd(point.income)}，支出 ${formatTwd(point.expense)}，查看這個月的紀錄`}
                className="fin-chart-hit"
                onPointerEnter={onlyMouse(() => setHover(i))}
                onPointerLeave={onlyMouse(() => setHover((value) => (value === i ? null : value)))}
                onFocus={() => setFocus(i)}
                onBlur={() => setFocus((value) => (value === i ? null : value))}
              />
            </li>
          ))}
        </ol>
      </div>

      <details className="disclosure text-sm">
        <summary>以表格檢視</summary>
        <table className="fin-table">
          <thead>
            <tr>
              <th scope="col" className="fin-table-label">
                月份
              </th>
              <th scope="col">收入</th>
              <th scope="col">支出</th>
            </tr>
          </thead>
          <tbody>
            {[...points].reverse().map((point) => (
              <tr key={point.month}>
                <th scope="row" className="fin-table-label">
                  {formatMonth(point.month)}
                </th>
                <td>{formatTwd(point.income)}</td>
                <td>{formatTwd(point.expense)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </section>
  );
}

/** 刻度由上到下 位置從底部算起 才跟格線對齊 */
function Ticks({ scale }: { scale: NiceScale }) {
  const labels = axisLabels(scale.ticks);
  return (
    <ol className="fin-chart-ticks" aria-hidden="true">
      {scale.ticks
        .map((tick, i) => ({ tick, label: labels[i] }))
        .reverse()
        .map(({ tick, label }) => (
          <li key={tick} style={{ bottom: `${scalePercent(tick, scale)}%` }}>
            {label}
          </li>
        ))}
    </ol>
  );
}

/**
 * 平常只是圖例 本月的數字頁首已經寫了 不重複
 * 滑過或鍵盤移到哪個月才寫出那個月的金額
 */
function Readout({ point }: { point: FlowPoint | null }) {
  return (
    <p className="fin-readout">
      {point && <span className="fin-readout-month">{formatMonth(point.month)}</span>}
      <span className="fin-readout-item">
        <span className="fin-key fin-key-income" aria-hidden="true" />
        收入{point && <strong>{formatTwd(point.income)}</strong>}
      </span>
      <span className="fin-readout-item">
        <span className="fin-key fin-key-expense" aria-hidden="true" />
        支出{point && <strong>{formatTwd(point.expense)}</strong>}
      </span>
    </p>
  );
}
