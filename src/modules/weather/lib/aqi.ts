import { asRecord, numberOf, text } from "@/core/json";
import { normalizeCounty, type County } from "./counties";
import { levelPosition } from "./scale";

// 環境部 aqx_p_432 空氣品質指標 每個測站一筆 每小時更新

/** 環境部公告的 AQI 分級 上限含在那一級裡 */
export const AQI_LEVELS = [
  { max: 50, label: "良好" },
  { max: 100, label: "普通" },
  { max: 150, label: "對敏感族群不健康" },
  { max: 200, label: "對所有族群不健康" },
  { max: 300, label: "非常不健康" },
  { max: Infinity, label: "危害" },
] as const;

export function aqiLevel(aqi: number): (typeof AQI_LEVELS)[number]["label"] {
  return (AQI_LEVELS.find((level) => aqi <= level.max) ?? AQI_LEVELS[AQI_LEVELS.length - 1]).label;
}

/** 危害沒有上限 色條畫到 500 */
const AQI_TOP = 500;

export const aqiPosition = (aqi: number): number => levelPosition(aqi, AQI_LEVELS.map((level) => level.max), AQI_TOP);

const [, MODERATE] = AQI_LEVELS;

/** 超過普通 也就是對敏感族群不健康以上 卡片用警示標籤 */
export function aqiWarns(aqi: number): boolean {
  return aqi > MODERATE.max;
}

/**
 * publishedAt 照回應的原文 例如 2026/10/16 15:00:00
 * PM2.5 與 PM10 是每立方公尺微克 臭氧是 ppb pollutant 是環境部寫的主要污染物 良好時是空的
 */
export type Station = { county: County; site: string; aqi: number; publishedAt: string | null; pm25: number | null; pm10: number | null; o3: number | null; pollutant: string | null };

/** 維修或停電的測站 AQI 是空的或不是數字 略過 */
export function parseStations(json: unknown): { stations: Station[]; missing: string[] } {
  const records = asRecord(json)?.records ?? (Array.isArray(json) ? json : undefined);
  if (!Array.isArray(records)) return { stations: [], missing: ["records"] };
  const stations = records.flatMap((item): Station[] => {
    const row = asRecord(item) ?? {};
    const county = typeof row.county === "string" ? normalizeCounty(row.county) : null;
    // 只收整數 維修中的測站是空字串
    const aqi = typeof row.aqi === "string" && /^\d+$/.test(row.aqi.trim()) ? Number(row.aqi) : typeof row.aqi === "number" ? row.aqi : null;
    const site = text(row.sitename, { allowBlank: true });
    if (county === null || aqi === null || site === null) return [];
    return [
      {
        county,
        site,
        aqi,
        publishedAt: text(row.publishtime, { allowBlank: true }),
        pm25: numberOf(row["pm2.5"]),
        pm10: numberOf(row.pm10),
        o3: numberOf(row.o3),
        pollutant: text(row.pollutant)?.trim() ?? null,
      },
    ];
  });
  return { stations, missing: records.length > 0 && stations.length === 0 ? ["records[].county", "records[].aqi", "records[].sitename"] : [] };
}

/** 這個縣市的測站 從差排到好 一樣時照回應的順序 */
export const countyStations = (stations: readonly Station[], county: County): Station[] => stations.filter((station) => station.county === county).sort((a, b) => b.aqi - a.aqi);

/** 一個縣市有好幾個測站 照最差的那一個 出門時才不會低估 */
export function countyAqi(stations: readonly Station[], county: County): (Station & { level: string; sites: number }) | null {
  const own = countyStations(stations, county);
  const [worst] = own;
  return worst ? { ...worst, level: aqiLevel(worst.aqi), sites: own.length } : null;
}
