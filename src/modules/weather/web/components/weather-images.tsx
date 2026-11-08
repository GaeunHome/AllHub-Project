import Image from "next/image";
import type { WeatherArt } from "../weather-view";
import type { DetailArt } from "../weekly-view";

// 圖都是 public/images 的靜態檔 來源與授權寫在各自資料夾的 LICENSE.md

export function WeatherImage({ art, alt, size }: { art: WeatherArt; alt: string; size: number }) {
  return <Image src={`/images/weather/${art}.png`} alt={alt} width={size} height={size} unoptimized className="shrink-0" />;
}

/** 今天的細節 空氣品質與特報每一格標題旁的小圖 */
export type TileArt = DetailArt | "leaf" | "mask" | "warning" | "check";

/** 旁邊就是標題 對報讀器是裝飾 */
export function TileImage({ art }: { art: TileArt }) {
  return <Image src={`/images/weather/${art}.png`} alt="" width={28} height={28} unoptimized className="shrink-0" />;
}

/** 台灣的縣市沒有國家代碼 不畫 名稱旁邊已經看得出是哪裡 所以對報讀器是裝飾 */
export function Flag({ country, size }: { country: string | null; size: number }) {
  if (!country) return null;
  return <Image src={`/images/flags/${country}.svg`} alt="" width={size} height={size} unoptimized className="shrink-0" />;
}
