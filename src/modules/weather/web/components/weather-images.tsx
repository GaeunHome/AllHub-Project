import Image from "next/image";
import type { WeatherArt } from "../weather-view";

// 圖都是 public/images 的靜態檔 來源與授權寫在各自資料夾的 LICENSE.md

export function WeatherImage({ art, alt, size }: { art: WeatherArt; alt: string; size: number }) {
  return <Image src={`/images/weather/${art}.png`} alt={alt} width={size} height={size} unoptimized className="shrink-0" />;
}

/** 台灣的縣市沒有國家代碼 不畫 名稱旁邊已經看得出是哪裡 所以對報讀器是裝飾 */
export function Flag({ country, size }: { country: string | null; size: number }) {
  if (!country) return null;
  return <Image src={`/images/flags/${country}.svg`} alt="" width={size} height={size} unoptimized className="shrink-0" />;
}
