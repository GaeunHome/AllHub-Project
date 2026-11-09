"use client";

import { formatTwd } from "../../../lib/money";
import { formatMonth, type MonthKey } from "../../../lib/month";
import { BarChart, monthAxis } from "./bar-chart";
import { flowChart, type FlowPoint } from "./trend-model";

type TrendChartProps = {
  /** 由舊到新最多 12 個月 剛開始用時比較少 */
  points: FlowPoint[];
  /** 台北時間的這個月 連到紀錄頁時不帶月份 */
  current: MonthKey;
};

/** 只有收入與支出 每個月是一個連結 點了到紀錄頁看那個月 */
export function TrendChart({ points, current }: TrendChartProps) {
  const chart = flowChart(points);
  return (
    <BarChart
      title="每月收支"
      points={points}
      axis={monthAxis(current)}
      scale={chart.scale}
      empty={chart.empty ? "還沒有收入或支出" : null}
      bars={(_, i) => (
        <>
          <span className="fin-bar fin-bar-income" style={{ height: `${chart.columns[i].incomeHeight}%` }} />
          <span className="fin-bar fin-bar-expense" style={{ height: `${chart.columns[i].expenseHeight}%` }} />
        </>
      )}
      readout={(point) => <Readout point={point} />}
      label={(point) => `${formatMonth(point.month)}：收入 ${formatTwd(point.income)}，支出 ${formatTwd(point.expense)}，查看這個月的紀錄`}
      table={{ headers: ["收入", "支出"], cells: (point) => [formatTwd(point.income), formatTwd(point.expense)] }}
    />
  );
}

/** 本月的數字頁首已經寫了 不重複 滑過或鍵盤移到哪個月才寫出那個月的金額 */
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
