"use client";

import Link from "next/link";
import { useId, useState, type CSSProperties, type PointerEvent } from "react";
import { Icon } from "@/core/ui/icon";
import { CardHeader } from "@/core/ui/page-header";
import type { TrendPoint } from "../../../lib/ledger";
import { formatSignedTwd, formatTwd } from "../../../lib/money";
import { formatMonth, formatMonthShort, type MonthKey } from "../../../lib/month";
import { scalePercent, type NiceScale } from "../../chart-geometry";
import { monthHref } from "../month-href";
import { Segmented } from "../segmented";
import { TREND_TITLE, assetChart, axisLabels, flowChart, readoutIndex, type TrendMode } from "./trend-model";

const MODES = [
  { id: "flow", label: "收支" },
  { id: "assets", label: "資產" },
] as const satisfies readonly { id: TrendMode; label: string }[];

type TrendChartProps = {
  /** 由舊到新最多 12 個月 剛開始用時比較少 */
  points: TrendPoint[];
  /** 總覽選到的月份 上方讀數預設顯示它 連結標成目前 */
  selected: MonthKey;
  initialMode?: TrendMode;
};

const onlyMouse = (handler: () => void) => (event: PointerEvent) => {
  if (event.pointerType === "mouse") handler();
};

/**
 * 收支與資產單位差很多 分成兩張圖切換 不用雙 y 軸
 * 每個月是一個連結 點了切換總覽的月份
 */
export function TrendChart({ points, selected, initialMode = "flow" }: TrendChartProps) {
  const [mode, setMode] = useState<TrendMode>(initialMode);
  const [hover, setHover] = useState<number | null>(null);
  const [focus, setFocus] = useState<number | null>(null);
  const headingId = useId();
  const active = readoutIndex(points, { hover, focus }, selected);
  const flow = flowChart(points);
  const assets = assetChart(points);
  const scale = mode === "flow" ? flow.scale : assets.scale;
  const columns = { gridTemplateColumns: `repeat(${points.length}, minmax(0, 1fr))` } as CSSProperties;
  const band = { left: `${(active / points.length) * 100}%`, width: `${100 / points.length}%` } as CSSProperties;

  return (
    <section aria-labelledby={headingId} className="card stack @container min-w-0">
      <CardHeader id={headingId} icon={<Icon name="chart-column" />} actions={<Segmented label="趨勢的內容" options={MODES} value={mode} onChange={setMode} fill={false} />}>
        {TREND_TITLE}
      </CardHeader>

      <Readout points={points} index={active} mode={mode} />

      <div className="fin-chart">
        <Ticks scale={scale} />
        <div className="fin-chart-plot">
          <div className="fin-chart-grid" aria-hidden="true">
            {scale.ticks.map((tick) => (
              <span key={tick} data-zero={tick === 0 ? "" : undefined} style={{ bottom: `${scalePercent(tick, scale)}%` }} />
            ))}
          </div>
          <span className="fin-chart-band" aria-hidden="true" style={band} />
          {/* 換圖時重新掛載 讓進場動畫再播一次 */}
          {mode === "flow" ? (
            flow.empty ? (
              <p className="fin-chart-empty">還沒有收入或支出</p>
            ) : (
              <div key="flow" className="fin-bars" aria-hidden="true" style={columns}>
                {flow.columns.map((column, i) => (
                  <div key={column.month} className="fin-bar-group">
                    <span className="fin-bar fin-bar-income" style={{ height: `${column.incomeHeight}%`, "--i": i } as CSSProperties} />
                    <span className="fin-bar fin-bar-expense" style={{ height: `${column.expenseHeight}%`, "--i": i } as CSSProperties} />
                  </div>
                ))}
              </div>
            )
          ) : (
            <div key="assets" className="fin-line" aria-hidden="true">
              <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="fin-line-svg">
                {assets.area && <path className="fin-line-area" d={assets.area} />}
                {/* 圖會被拉成卡片的寬高 線寬維持 2px 不跟著變形 */}
                {assets.line && <path className="fin-line-path" d={assets.line} vectorEffect="non-scaling-stroke" />}
              </svg>
              <span className="fin-crosshair" style={{ left: `${assets.points[active].x}%` }} />
              <span className="fin-line-dot" style={{ left: `${assets.points[active].x}%`, bottom: `${assets.points[active].y}%` }} />
            </div>
          )}
        </div>
        <ol className="fin-chart-months" aria-hidden="true" style={columns}>
          {points.map((point, i) => (
            <li key={point.month} data-current={point.month === selected ? "" : undefined}>
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
                href={monthHref(point.month)}
                scroll={false}
                aria-label={`${linkLabel(point, mode)}，查看這個月`}
                aria-current={point.month === selected ? "true" : undefined}
                className="fin-chart-hit"
                onPointerEnter={onlyMouse(() => setHover(i))}
                onPointerLeave={onlyMouse(() => setHover((current) => (current === i ? null : current)))}
                onFocus={() => setFocus(i)}
                onBlur={() => setFocus((current) => (current === i ? null : current))}
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
              <th scope="col">月底資產</th>
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
                <td>{formatTwd(point.assets)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </section>
  );
}

function linkLabel(point: TrendPoint, mode: TrendMode): string {
  return mode === "flow"
    ? `${formatMonth(point.month)}：收入 ${formatTwd(point.income)}，支出 ${formatTwd(point.expense)}`
    : `${formatMonth(point.month)}底總資產 ${formatTwd(point.assets)}`;
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

/** 平常是選到的月份 滑過或鍵盤移到哪個月就換成那個月 色塊兼當圖例 */
function Readout({ points, index, mode }: { points: TrendPoint[]; index: number; mode: TrendMode }) {
  const point = points[index];
  if (mode === "flow") {
    return (
      <p className="fin-readout">
        <span className="fin-readout-month">{formatMonth(point.month)}</span>
        <span className="fin-readout-item">
          <span className="fin-key fin-key-income" aria-hidden="true" />
          收入<strong>{formatTwd(point.income)}</strong>
        </span>
        <span className="fin-readout-item">
          <span className="fin-key fin-key-expense" aria-hidden="true" />
          支出<strong>{formatTwd(point.expense)}</strong>
        </span>
        <span className="fin-readout-item">
          存下<strong>{formatTwd(point.income - point.expense)}</strong>
        </span>
      </p>
    );
  }
  const previous = index > 0 ? points[index - 1] : null;
  return (
    <p className="fin-readout">
      <span className="fin-readout-month">{formatMonth(point.month)}底</span>
      <span className="fin-readout-item">
        總資產<strong>{formatTwd(point.assets)}</strong>
      </span>
      {previous && (
        <span className="fin-readout-item">
          比上個月<strong>{formatSignedTwd(point.assets - previous.assets)}</strong>
        </span>
      )}
    </p>
  );
}
