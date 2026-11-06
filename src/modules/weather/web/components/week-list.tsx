"use client";

import { Dialog, useDialog } from "@/core/ui/dialog";
import { DRAG_SCROLL } from "@/core/ui/drag-scroll";
import { Icon } from "@/core/ui/icon";
import type { HourColumn, WeekRow } from "../weekly-view";
import { WeatherImage } from "./weather-images";

function DayCells({ row }: { row: WeekRow }) {
  return (
    <>
      <span className="text-ink">{row.label}</span>
      <WeatherImage art={row.art} alt={row.weather ?? ""} size={32} />
      <span className="wx-rain">{row.rain ? `${row.rain}%` : ""}</span>
      <span className="wx-low">{row.low === null ? "" : `${row.low}°`}</span>
      <span aria-hidden className="wx-bar">
        <i style={{ left: `${row.left}%`, right: `${row.right}%` }} />
      </span>
      <span className="wx-high">{row.high === null ? "" : `${row.high}°`}</span>
    </>
  );
}

function HourStrip({ hours }: { hours: HourColumn[] }) {
  return (
    <ol aria-label="每小時預報" tabIndex={0} {...DRAG_SCROLL} className="wx-hours no-scrollbar">
      {hours.map((hour) => (
        <li key={hour.time} className="wx-hour">
          <span>{hour.clock}</span>
          <WeatherImage art={hour.art} alt={hour.weather ?? ""} size={36} />
          <span className="wx-hour-temp">{hour.temperature === null ? "--" : `${hour.temperature}°`}</span>
          <span className="wx-rain">{hour.rain === null ? "" : `${hour.rain}%`}</span>
        </li>
      ))}
    </ol>
  );
}

function ClickableDay({ row, hours }: { row: WeekRow; hours: HourColumn[] }) {
  const dialog = useDialog();
  return (
    <>
      <button {...dialog.triggerProps} className="wx-row wx-row-button">
        <span className="sr-only">看每小時預報</span>
        <DayCells row={row} />
        <Icon name="chevron-right" className="size-4" />
      </button>
      <Dialog {...dialog.dialogProps} title={`${row.label}的每小時預報`} size="md">
        <HourStrip hours={hours} />
      </Dialog>
    </>
  );
}

/** hours 以日期為 key 氣象署只有三天 沒有每小時的那天不能點開 */
export function WeekList({ rows, hours }: { rows: WeekRow[]; hours: Record<string, HourColumn[]> }) {
  return (
    <ul aria-label="一週預報" className="card wx-week">
      {rows.map((row) => {
        const columns = hours[row.date];
        return (
          <li key={row.date} className="wx-day">
            {columns ? (
              <ClickableDay row={row} hours={columns} />
            ) : (
              <div className="wx-row">
                <DayCells row={row} />
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
