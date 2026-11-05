import type { SearchParams } from "@/core/module";
import { weatherInfo } from "@/modules/weather/info";
import { WeatherPage } from "@/modules/weather/web/pages/weather-page";

export default function Page({ searchParams }: { searchParams: SearchParams }) {
  return <WeatherPage info={weatherInfo} searchParams={searchParams} />;
}
