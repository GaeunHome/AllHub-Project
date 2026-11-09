import { InfoTip } from "@/core/ui/info-tip";
import { CardHeader } from "@/core/ui/page-header";
import type { County } from "../../lib/counties";
import type { DayDetails } from "../../lib/details";
import { localClock, localDay, nextDayHours, type HourPoint } from "../../lib/weekly";
import { hoursOf, type PlaceWeek } from "../place-week";
import { detailTiles, type DetailTile } from "../weekly-view";
import { MeterBar } from "./detail-meter";
import { TileImage } from "./weather-images";

/** 最高最低與幾點看接下來 24 小時 跟上面那一排一樣 */
export function detailsOf(details: DayDetails, week: PlaceWeek, hours: readonly HourPoint[], now = new Date()): DetailTile[] {
  const offset = week.utcOffsetSeconds;
  return detailTiles(details, { clock: localClock(now, offset), today: localDay(now, offset), hours: nextDayHours(hours, now, offset) });
}

export function TodayDetails({ tiles }: { tiles: DetailTile[] }) {
  return (
    <section aria-labelledby="wx-details" className="card stack wx-fill">
      <CardHeader id="wx-details" actions={<InfoTip label="今天的細節的說明">最高最低與幾點看接下來 24 小時</InfoTip>}>
        今天的細節
      </CardHeader>
      <dl className="wx-tiles">
        {tiles.map((tile) => (
          <div key={tile.label} className="panel wx-tile">
            <dt className="wx-tile-label">
              <TileImage art={tile.art} />
              {tile.label}
            </dt>
            <dd className="wx-tile-value">{tile.value}</dd>
            {tile.lines.map((line, index) => (
              <dd key={line} className={index === 0 ? "wx-tile-line font-semibold" : "wx-tile-line"}>
                {line}
              </dd>
            ))}
            {tile.meter && (
              <dd className="wx-tile-meter">
                <MeterBar meter={tile.meter} />
              </dd>
            )}
          </div>
        ))}
      </dl>
    </section>
  );
}

/** 台灣的每小時另外讀 讀到之前先畫一天的數字 跟接下來 24 小時共用同一份 */
export async function TodayDetailsWithHours({ county, week, details }: { county: County | null; week: PlaceWeek; details: DayDetails }) {
  const hours = await hoursOf(county, week);
  return <TodayDetails tiles={detailsOf(details, week, hours)} />;
}
