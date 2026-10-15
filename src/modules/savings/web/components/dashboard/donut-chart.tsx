"use client";

import { useReducer, type CSSProperties, type PointerEvent } from "react";
import type { Slice } from "../../../lib/ledger";
import { formatTwd } from "../../../lib/money";
import { DONUT_CIRCUMFERENCE, DONUT_RADIUS, donutSegments, liftOffset, roundTo, type DonutSegment } from "../../chart-geometry";
import { formatPercent } from "../../dashboard-view";
import { ColorDot, finColor } from "../color-dot";
import { AnimatedNumber } from "../motion/animated-number";
import { NO_FOCUS, activeKey, chartFocusReducer } from "./chart-focus";
import { DONUT_LAYOUT } from "./layout";

// 單位是 viewBox 的 42 見方 圓周是 100
const RING_WIDTH = 4;
const LIFT = 1.2;
// 多畫的圓弧停在終點而且長度 0 切換分組時從這裡長出來 不會憑空出現
const PARKED: DonutSegment = { start: DONUT_CIRCUMFERENCE, length: 0, mid: DONUT_CIRCUMFERENCE };

const num = (value: number) => String(roundTo(value, 3));

// 多畫的圓弧透明 切換分組時才從透明換成那一片的顏色
const NO_COLOR = { "--fin-color": "transparent" } as CSSProperties;

function arcStyle(slice: Slice | undefined, segment: DonutSegment, index: number): CSSProperties {
  const lift = liftOffset(segment.mid, LIFT);
  const color = slice ? finColor(slice.color) : NO_COLOR;
  return {
    ...color,
    strokeDasharray: `${num(segment.length)} ${num(DONUT_CIRCUMFERENCE - segment.length)}`,
    strokeDashoffset: num(-segment.start),
    "--i": index,
    "--lift-x": `${lift.x}px`,
    "--lift-y": `${lift.y}px`,
  } as CSSProperties;
}

type DonutChartProps = {
  /** 圖的名稱 圖例的 aria-label 會用到 */
  label: string;
  slices: Slice[];
  /** 取兩組裡比較多的片數 切換分組時片數變了也能接著動 */
  arcCount?: number;
  /** 中間平常顯示的合計 */
  center: { label: string; amount: number };
  /** 點選固定的那片 外層決定要做什麼 例如列出這個分類的紀錄 */
  selected: string | null;
  onSelect: (key: string) => void;
  /** 圖例按鈕控制的區塊 id 例如支出圓餅圖的紀錄清單 */
  controls?: string;
};

/**
 * 圖例是按鈕 滑過 鍵盤焦點與點選都跟圓環同步
 * 名稱 金額 百分比都寫在圖例裡 圓環只是輔助
 */
export function DonutChart({ label, slices, arcCount = slices.length, center, selected, onSelect, controls }: DonutChartProps) {
  const [focus, dispatch] = useReducer(chartFocusReducer, NO_FOCUS);
  const keys = slices.map((slice) => slice.key);
  const active = activeKey(focus, selected, keys);
  const activeSlice = slices.find((slice) => slice.key === active);
  const segments = donutSegments(slices.map((slice) => slice.amount));
  const arcs = Array.from({ length: Math.max(arcCount, slices.length) }, (_, i) => ({ slice: slices[i], segment: segments[i] ?? PARKED }));

  // 手指離開時沒有 pointerleave 滑過不會結束 所以只認滑鼠 觸控靠點選
  const hover = (key: string) => ({
    onPointerEnter: (event: PointerEvent) => {
      if (event.pointerType === "mouse") dispatch({ type: "hover", key });
    },
    onPointerLeave: (event: PointerEvent) => {
      if (event.pointerType === "mouse") dispatch({ type: "unhover", key });
    },
  });

  return (
    <div className={DONUT_LAYOUT}>
      <p className="sr-only">
        {center.label} {formatTwd(center.amount)}，分成 {slices.length} 類
      </p>
      <div className="fin-donut-figure" data-active={activeSlice ? "" : undefined}>
        <svg viewBox="0 0 42 42" aria-hidden="true" className="fin-donut-ring">
          <g transform="rotate(-90 21 21)">
            {arcs.map(({ slice, segment }, i) => (
              <circle
                key={i}
                className="fin-donut-arc"
                data-active={slice !== undefined && slice.key === active ? "" : undefined}
                cx="21"
                cy="21"
                r={DONUT_RADIUS}
                strokeWidth={RING_WIDTH}
                style={arcStyle(slice, segment, i)}
                {...(slice ? { ...hover(slice.key), onClick: () => onSelect(slice.key) } : {})}
              />
            ))}
          </g>
        </svg>
        {/* 中間的字跟著滑過的片變 報讀器改讀上面那句與圖例 */}
        <div className="fin-donut-center" aria-hidden="true">
          {/* 合計一直掛著只是藏起來 移開時數字才不會從 0 重新數 */}
          <span className="fin-donut-center-total" hidden={activeSlice ? true : undefined}>
            <span className="fin-donut-center-label">{center.label}</span>
            <AnimatedNumber value={center.amount} className="fin-donut-center-amount" />
          </span>
          {activeSlice && (
            <span className="fin-donut-center-slice">
              <span className="fin-donut-center-label">{activeSlice.label}</span>
              <span className="fin-donut-center-amount">{formatTwd(activeSlice.amount)}</span>
              <span className="fin-donut-center-percent">{formatPercent(activeSlice.percent)}</span>
            </span>
          )}
        </div>
      </div>
      <ul aria-label={`${label}的圖例`} className="fin-legend">
        {slices.map((slice) => (
          <li key={slice.key}>
            <button
              type="button"
              aria-pressed={selected === slice.key}
              aria-controls={controls}
              data-active={slice.key === active ? "" : undefined}
              className="fin-legend-item"
              onClick={() => onSelect(slice.key)}
              // 滑鼠點了也會拿到焦點 只有鍵盤移來的才算正在看這片 點選看 selected
              onFocus={(event) => {
                if (event.currentTarget.matches(":focus-visible")) dispatch({ type: "focus", key: slice.key });
              }}
              onBlur={() => dispatch({ type: "blur", key: slice.key })}
              {...hover(slice.key)}
            >
              <ColorDot color={slice.color} />
              <span className="fin-legend-label">{slice.label}</span>
              <span className="fin-legend-amount">{formatTwd(slice.amount)}</span>
              <span className="fin-legend-percent">{formatPercent(slice.percent)}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
