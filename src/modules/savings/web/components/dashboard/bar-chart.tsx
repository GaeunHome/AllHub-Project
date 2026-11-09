"use client";

import Link from "next/link";
import { useId, useState, type CSSProperties, type PointerEvent, type ReactNode } from "react";
import { CardHeader } from "@/core/ui/page-header";
import { formatMonth, formatMonthShort, type MonthKey } from "../../../lib/month";
import { scalePercent, type NiceScale } from "./chart-geometry";
import { monthRecordsHref } from "../../paths";
import { axisLabels, readoutIndex } from "./trend-model";

// 每月收支與資產走勢共用 刻度 底下的日期 滑過的讀數與表格只寫一份

/** 一根是一個月或一天 由各自的圖給 */
export type ChartAxis<P> = {
  key: (point: P) => string;
  /** 底下那一列的字 放不下時只寫一部分 */
  tick: (point: P, index: number) => ReactNode;
  current: (point: P) => boolean;
  /** 點了到紀錄頁看那個月 */
  href: (point: P) => string;
  /** 表格的第一欄 */
  heading: string;
  name: (point: P) => string;
};

/** 一個月一根 卡片太窄時只寫數字 才不會擠成兩行 年份寫在第一個月與一月 */
export const monthAxis = (current: MonthKey): ChartAxis<{ month: MonthKey }> => ({
  key: (point) => point.month,
  tick: (point, i) => (
    <>
      <span className="@sm:hidden">{Number(point.month.slice(5, 7))}</span>
      <span className="hidden @sm:inline">{formatMonthShort(point.month)}</span>
      {(i === 0 || point.month.endsWith("-01")) && <span className="block">{point.month.slice(0, 4)}</span>}
    </>
  ),
  current: (point) => point.month === current,
  href: (point) => monthRecordsHref(point.month, current),
  heading: "月份",
  name: (point) => formatMonth(point.month),
});

type BarChartProps<P> = {
  title: string;
  /** 標題列右邊 例如說明的 i 圓圈 */
  actions?: ReactNode;
  /** 由舊到新 剛開始用時比較少 */
  points: P[];
  axis: ChartAxis<P>;
  scale: NiceScale;
  /** 沒有任何數字時圖上寫的字 有數字時是 null */
  empty: string | null;
  bars: (point: P, index: number) => ReactNode;
  /** 平常只是圖例 滑過或鍵盤移到哪一根才寫金額 */
  readout: (point: P | null) => ReactNode;
  /** 每一根的連結念的內容 */
  label: (point: P) => string;
  table: { headers: string[]; cells: (point: P) => string[] };
};

const onlyMouse = (handler: () => void) => (event: PointerEvent) => {
  if (event.pointerType === "mouse") handler();
};

/** 每一根是一個連結 點了到紀錄頁看那個月 */
export function BarChart<P>({ title, actions, points, axis, scale, empty, bars, readout, label, table }: BarChartProps<P>) {
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
                <div key={axis.key(point)} className="fin-bar-group">
                  {bars(point, i)}
                </div>
              ))}
            </div>
          )}
        </div>
        <ol className="fin-chart-months" aria-hidden="true" style={columns}>
          {points.map((point, i) => (
            <li key={axis.key(point)} data-current={axis.current(point) ? "" : undefined}>
              {axis.tick(point, i)}
            </li>
          ))}
        </ol>
        {/* 疊在圖與日期上面 整欄都能點 手機上一欄很窄 */}
        <ol className="fin-chart-hits" style={columns}>
          {points.map((point, i) => (
            <li key={axis.key(point)} className="flex">
              <Link
                href={axis.href(point)}
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
                {axis.heading}
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
              <tr key={axis.key(point)}>
                <th scope="row" className="fin-table-label">
                  {axis.name(point)}
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
