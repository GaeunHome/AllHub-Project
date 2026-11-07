import { DRAG_SCROLL } from "@/core/ui/drag-scroll";
import type { HourColumn } from "../weekly-view";
import { WeatherImage } from "./weather-images";

/** 橫向滑 一格一個時間 fill 時格子撐滿整排 放不下才滑 */
export function HourStrip({ hours, label, fill = false }: { hours: HourColumn[]; label: string; fill?: boolean }) {
  return (
    <ol aria-label={label} tabIndex={0} {...DRAG_SCROLL} className={fill ? "wx-hours wx-hours-fill no-scrollbar" : "wx-hours no-scrollbar"}>
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
