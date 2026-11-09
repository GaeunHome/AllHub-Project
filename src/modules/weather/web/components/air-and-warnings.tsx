import type { ReactNode } from "react";
import { InfoTip } from "@/core/ui/info-tip";
import { CardHeader } from "@/core/ui/page-header";
import { LoadingState, Skeleton } from "@/core/ui/skeleton";
import { aqiPosition } from "../../lib/aqi";
import type { County } from "../../lib/counties";
import { cachedStations, cachedWarnings } from "../../service/cached";
import { weatherKeys } from "../../service/weather";
import { airView, warningRows, type AirView, type StationRow, type WarningRow } from "../weather-view";
import { MeterBar } from "./detail-meter";
import { TileImage, type TileArt } from "./weather-images";

// 只有台灣的縣市 跟首頁卡片讀同一份空氣品質與特報

type Parts = { air: boolean; warnings: boolean };

/** 沒設授權碼的那一半不讀也不畫 兩個都沒有時整區不出現 */
export function airParts(): Parts | null {
  const keys = weatherKeys();
  return keys.airQuality || keys.forecast ? { air: keys.airQuality, warnings: keys.forecast } : null;
}

const titleOf = ({ air, warnings }: Parts) => (air && warnings ? "空氣品質與特報" : air ? "空氣品質" : "天氣特報");

function Frame({ parts, wide, children }: { parts: Parts; wide: boolean; children: ReactNode }) {
  return (
    <section aria-labelledby="wx-air" className={wide ? "card stack wx-wide" : "card stack"}>
      {/* 政府資料開放授權條款要標示出處 */}
      <CardHeader
        id="wx-air"
        actions={
          <InfoTip label="空氣品質與特報的說明">
            資料來源：中央氣象署{parts.air && "、環境部，空氣品質看縣市裡最差的測站"}
          </InfoTip>
        }
      >
        {titleOf(parts)}
      </CardHeader>
      {children}
    </section>
  );
}

/** 讀不到時沒有圖 特報的驚嘆號不能讓人以為有特報 */
function Part({ label, art, className, children }: { label: string; art: TileArt | null; className: string; children: ReactNode }) {
  return (
    <div className={`panel wx-tile ${className}`}>
      <p className="wx-tile-label">
        {art && <TileImage art={art} />}
        {label}
      </p>
      {children}
    </div>
  );
}

const POLLUTANTS = [
  { key: "pm25", label: "PM2.5", unit: "μg/m³" },
  { key: "pm10", label: "PM10", unit: "μg/m³" },
  { key: "o3", label: "臭氧", unit: "ppb" },
] as const;

/** 使用者選的污染物數字＋測站清單 等級寫成一般的字 不用小標籤 */
function AirPart({ air }: { air: AirView | null }) {
  if (!air) return <p className="text-ink">暫時無法讀取</p>;
  const pollutants = POLLUTANTS.flatMap(({ key, label, unit }) => (air[key] === null ? [] : [{ label, unit, value: air[key] }]));
  return (
    <>
      <p className="flex items-baseline gap-1.5">
        <span className="wx-tile-value">{air.aqi}</span>
        <span className="font-semibold text-ink">AQI</span>
      </p>
      <p className="font-semibold text-ink">{air.level}</p>
      <p className="wx-tile-line">{air.time ? `${air.site}測站 ${air.time}` : `${air.site}測站`}</p>
      {air.pollutant && <p className="wx-tile-line">主要污染物 {air.pollutant}</p>}
      <div className="wx-tile-meter">
        <MeterBar meter={{ kind: "aqi", at: aqiPosition(air.aqi) }} />
      </div>
      {pollutants.length > 0 && (
        <dl className="wx-pollutants">
          {pollutants.map(({ label, unit, value }) => (
            <div key={label}>
              <dt className="font-medium text-ink">{label}</dt>
              <dd className="text-lg font-semibold text-ink tabular-nums">{value}</dd>
              <dd className="text-sm text-ink">{unit}</dd>
            </div>
          ))}
        </dl>
      )}
      {air.stations.length > 1 && <StationList stations={air.stations} />}
    </>
  );
}

/** 縣市裡每個測站 從差排到好 數字與等級都寫出來 色條只是一眼看出高低 */
function StationList({ stations }: { stations: StationRow[] }) {
  return (
    <div className="wx-stations-block">
      <p className="font-semibold text-ink">各測站</p>
      <ul className="wx-stations">
        {stations.map((station) => (
          <li key={station.site} className="wx-station">
            <span className="flex items-baseline justify-between gap-2">
              <span className="font-medium text-ink">{station.site}</span>
              <span className="font-semibold text-ink tabular-nums">{station.aqi}</span>
            </span>
            <span className="sr-only">{station.level}</span>
            <MeterBar meter={{ kind: "aqi", at: station.at }} />
          </li>
        ))}
      </ul>
    </div>
  );
}

/** 使用者不要小標籤 一則一列 左邊的線警報是紅色 特報是黃色 */
function WarningRows({ rows }: { rows: WarningRow[] }) {
  return (
    <ul className="wx-warnings">
      {rows.map((row) => (
        <li key={row.label} className="wx-warning" data-severe={row.severe ? "" : undefined}>
          <span className="font-semibold text-ink">{row.label}</span>
          {row.until && <span className="text-ink">{row.until}</span>}
        </li>
      ))}
    </ul>
  );
}

/** 沒有特報或讀不到時縮成一行 讓空氣品質撐開 */
function WarningLine({ rows }: { rows: WarningRow[] | null }) {
  return (
    <p className="wx-air-line">
      {rows && <TileImage art="check" />}
      {rows ? "目前沒有天氣特報" : "天氣特報暫時無法讀取"}
    </p>
  );
}

/** wide 是旁邊沒有今天的細節時撐滿整列 */
export async function AirAndWarnings({ county, wide = false }: { county: County; wide?: boolean }) {
  const parts = airParts();
  if (!parts) return null;
  const now = new Date();
  const [stations, warnings] = await Promise.all([parts.air ? cachedStations() : null, parts.warnings ? cachedWarnings(county) : null]);
  const air = stations && airView(stations, county);
  const rows = warnings && warningRows(warnings, now);
  return (
    <Frame parts={parts} wide={wide}>
      <div className="wx-air">
        {parts.air && (
          <Part label="空氣品質" art={air?.warn ? "mask" : "leaf"} className="wx-air-part">
            <AirPart air={air} />
          </Part>
        )}
        {parts.warnings &&
          (rows && rows.length > 0 ? (
            <Part label="天氣特報" art="warning" className="wx-warning-part">
              <WarningRows rows={rows} />
            </Part>
          ) : (
            <WarningLine rows={rows} />
          ))}
      </div>
    </Frame>
  );
}

export function AirAndWarningsSkeleton({ wide = false }: { wide?: boolean }) {
  const parts = airParts();
  if (!parts) return null;
  return (
    <Frame parts={parts} wide={wide}>
      <LoadingState label={`載入${titleOf(parts)}…`} className="wx-air">
        {parts.air && <Skeleton className="wx-air-part h-64 rounded-xl" />}
        {parts.warnings && <Skeleton className="h-8 basis-full rounded-xl" />}
      </LoadingState>
    </Frame>
  );
}
