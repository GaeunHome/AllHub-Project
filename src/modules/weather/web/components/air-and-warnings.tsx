import type { ReactNode } from "react";
import { InfoTip } from "@/core/ui/info-tip";
import { CardHeader } from "@/core/ui/page-header";
import { LoadingState, Skeleton } from "@/core/ui/skeleton";
import { StatusChip } from "@/core/ui/status-chip";
import type { County } from "../../lib/counties";
import { cachedStations, cachedWarnings } from "../../service/cached";
import { weatherKeys } from "../../service/weather";
import { airView, warningChips, type AirView, type WarningChip } from "../weather-view";
import { WarningChips } from "./warning-chips";

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

function Part({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="panel wx-tile">
      <p className="wx-tile-label">{label}</p>
      {children}
    </div>
  );
}

/** 不好時用警示標籤 平常只寫等級 */
function AirPart({ air }: { air: AirView | null }) {
  if (!air) return <p className="text-ink">暫時無法讀取</p>;
  return (
    <>
      <p className="flex items-baseline gap-1.5">
        <span className="wx-tile-value">{air.aqi}</span>
        <span className="font-semibold text-ink">AQI</span>
      </p>
      {air.warn ? <StatusChip badge={{ label: air.level, tone: "warning" }} className="w-fit" /> : <p className="font-semibold text-ink">{air.level}</p>}
      <p className="text-ink">{air.time ? `${air.site}測站 ${air.time}` : `${air.site}測站`}</p>
    </>
  );
}

function WarningPart({ chips }: { chips: WarningChip[] | null }) {
  if (chips === null) return <p className="text-ink">暫時無法讀取</p>;
  if (chips.length === 0) return <p className="font-semibold text-ink">目前沒有天氣特報</p>;
  return <WarningChips chips={chips} />;
}

/** wide 是旁邊沒有今天的細節時撐滿整列 */
export async function AirAndWarnings({ county, wide = false }: { county: County; wide?: boolean }) {
  const parts = airParts();
  if (!parts) return null;
  const now = new Date();
  const [stations, warnings] = await Promise.all([parts.air ? cachedStations() : null, parts.warnings ? cachedWarnings(county) : null]);
  return (
    <Frame parts={parts} wide={wide}>
      <div className="wx-air">
        {parts.air && (
          <Part label="空氣品質">
            <AirPart air={stations && airView(stations, county)} />
          </Part>
        )}
        {parts.warnings && (
          <Part label="天氣特報">
            <WarningPart chips={warnings && warningChips(warnings, now)} />
          </Part>
        )}
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
        {parts.air && <Skeleton className="h-32 rounded-xl" />}
        {parts.warnings && <Skeleton className="h-32 rounded-xl" />}
      </LoadingState>
    </Frame>
  );
}
