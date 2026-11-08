import { CardHeader } from "@/core/ui/page-header";
import type { DetailTile } from "../weekly-view";
import { MeterBar } from "./detail-meter";
import { TileImage } from "./weather-images";

/** 跟一週預報同一個回應 不用另外等 wide 是旁邊沒有空氣品質時撐滿整列 */
export function TodayDetails({ tiles, wide }: { tiles: DetailTile[]; wide: boolean }) {
  return (
    <section aria-labelledby="wx-details" className={wide ? "card stack wx-wide" : "card stack"}>
      <CardHeader id="wx-details">今天的細節</CardHeader>
      <dl className="wx-tiles">
        {tiles.map((tile) => (
          <div key={tile.label} className="panel wx-tile">
            <dt className="wx-tile-label">
              <TileImage art={tile.art} />
              {tile.label}
            </dt>
            <dd className="wx-tile-value">{tile.value}</dd>
            {tile.sub && <dd className="text-ink">{tile.sub}</dd>}
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
