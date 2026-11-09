"use client";

import Link from "next/link";
import { useId, useState, type CSSProperties, type PointerEvent, type ReactNode } from "react";
import { CardHeader } from "@/core/ui/page-header";
import { formatMonth, formatMonthShort, type MonthKey } from "../../../lib/month";
import { scalePercent, type NiceScale } from "./chart-geometry";
import { monthRecordsHref } from "../../paths";
import { axisLabels, readoutIndex } from "./trend-model";

// 每月收支與資產走勢共用 刻度 月份 滑過的讀數與表格只寫一份

type MonthChartProps<P extends { month: MonthKey }> = {
  title: string;
  /** 標題列右邊 例如說明的 i 圓圈 */
  actions?: ReactNode;
  /** 由舊到新 剛開始用時比較少 */
  points: P[];
  /** 台北時間的這個月 連到紀錄頁時不帶月份 */
  current: MonthKey;
  scale: NiceScale;
  /** 沒有任何數字時圖上寫的字 有數字時是 null */
  empty: string | null;
  bars: (point: P, index: number) => ReactNode;
  /** 平常只是圖例 滑過或鍵盤移到哪個月才寫金額 */
  readout: (point: P | null) => ReactNode;
  /** 每個月的連結念的內容 */
  label: (point: P) => string;
  table: { headers: string[]; cells: (point: P) => string[] };
};

const onlyMouse = (handler: () => void) => (event: PointerEvent) => {
  if (event.pointerType === "mouse") handler();
};

/** 每個月是一個連結 點了到紀錄頁看那個月 */
export function MonthChart<P extends { month: MonthKey }>({ title, actions, points, current, scale, empty, bars, readout, label, table }: MonthChartProps<P>) {
  const [hover, setHover] = useState<number | null>(null);
  const [focus, setFocus] = useState<number | null>(null);
  const headingId = useId();
  const active = readoutIndex(points, { hover, focus });
  const columns = { gridTemplateColumns: `repeat(${points.length}, minmax(0, 1fr))` } as CSSProperties;

  return (
    <section aria-labelledby={headingId} className="card stack @container min-w-0">
      <CardHeader id={headingId} actions={actions}>
        {title}
      </CardHeader>

      {readout(active === null ? null : points[active])}

      <div className="fin-chart">
        <Ticks scale={scale} />
        <div className="fin-chart-plot">
          <div className="fin-chart-grid" aria-hidden="true">
            {scale.ticks.map((tick) => (
              <span key={tick} data-zero={tick === 0 ? "" : undefined} style={{ bottom: `${scalePercent(tick, scale)}%` }} />
            ))}
          </div>
          {active !== null && <span className="fin-chart-band" aria-hidden="true" style={{ left: `${(active / points.length) * 100}%`, width: `${100 / points.length}%` }} />}
          {empty !== null ? (
            <p className="fin-chart-empty">{empty}</p>
          ) : (
            <div className="fin-bars" aria-hidden="true" style={columns}>
              {points.map((point, i) => (
                <div key={point.month} className="fin-bar-group">
                  {bars(point, i)}
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
                aria-label={label(point)}
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
              {table.headers.map((header) => (
                <th key={header} scope="col">
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[...points].reverse().map((point) => (
              <tr key={point.month}>
                <th scope="row" className="fin-table-label">
                  {formatMonth(point.month)}
                </th>
                {table.cells(point).map((cell, i) => (
                  <td key={table.headers[i]}>{cell}</td>
                ))}
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
