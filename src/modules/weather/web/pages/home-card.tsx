import type { ReactNode } from "react";
import { requireModule } from "@/core/auth";
import type { ModuleInfo } from "@/core/module";
import { HomeCard } from "@/core/ui/home-card";
import { Icon, type UiIconName } from "@/core/ui/icon";
import { InfoTip } from "@/core/ui/info-tip";
import { Scene } from "@/core/ui/scene";
import { LoadingState, Skeleton } from "@/core/ui/skeleton";
import type { RainLevel } from "../../lib/rain";
import { cachedForecast, cachedSettings, cachedStations, cachedWarnings } from "../../service/cached";
import type { WeatherSettings } from "../../service/settings";
import { weatherKeys } from "../../service/weather";
import { CountyPicker } from "../components/county-picker";
import { WarningChips } from "../components/warning-chips";
import { weatherView, type PeriodView, type Reminder, type WeatherView } from "../weather-view";

// web 層不能 import 模組根目錄 所以 info 由 src/app 傳進來
export function WeatherHomeCard({ info }: { info: ModuleInfo }) {
  return (
    <HomeCard info={info} title="天氣" variant="bare" className="h-full" skeleton={<WeatherSkeleton />}>
      <WeatherSnapshot />
    </HomeCard>
  );
}

export async function WeatherSnapshot() {
  const user = await requireModule("weather");
  const settings = await cachedSettings(user.id);
  if (settings === null) {
    return <WeatherPrompt title="選擇所在的縣市" hint="首頁會顯示那裡的天氣、空氣品質與天氣特報，會下雨時提醒帶傘" action={<CountyPicker settings={null} />} />;
  }
  const keys = weatherKeys();
  if (!keys.forecast) {
    return <WeatherPrompt title="還沒設定氣象署的授權碼" hint="站長在 Vercel 的環境變數加上 CWA_API_KEY 就會顯示" />;
  }
  const now = new Date();
  const [forecast, stations, warnings] = await Promise.all([cachedForecast(settings.county), keys.airQuality ? cachedStations() : undefined, cachedWarnings(settings.county)]);
  return <WeatherBody view={weatherView(settings.county, forecast, stations, now, warnings)} settings={settings} />;
}

const SCENE_FRAME = "flex h-full min-h-88 flex-col";

/** 還沒有天氣可以看 一樣用晴天的圖 版面才不會空一塊 */
function WeatherPrompt({ title, hint, action }: { title: string; hint: string; action?: ReactNode }) {
  return (
    <Scene src="/images/scenes/weather-clear-day.svg" eager className={`${SCENE_FRAME} items-start justify-end gap-3 p-5 sm:p-6`}>
      <div className="flex flex-col gap-1">
        <p className="text-xl font-bold text-white">{title}</p>
        <p className="text-white/90">{hint}</p>
      </div>
      {action}
    </Scene>
  );
}

/** 上面是今天的樣子 下面一條是數字 所有縣市都排在同樣的位置 一眼就找得到 */
function WeatherBody({ view, settings }: { view: WeatherView; settings: WeatherSettings }) {
  return (
    <Scene src={view.scene} eager className={SCENE_FRAME}>
      <div className="flex flex-1 flex-col gap-4 p-5 sm:p-6">
        <div className="flex items-center gap-1.5">
          <p className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 font-semibold">
            <Icon name="map-pin" className="size-4 shrink-0" />
            <span>{view.county}</span>
            {view.now && <span className="font-normal text-white/90">{view.now.label}</span>}
          </p>
          {/* 政府資料開放授權條款要標示出處 */}
          <InfoTip label="天氣資料的來源">
            資料來源：中央氣象署{view.air !== undefined && "、環境部"}
          </InfoTip>
          <CountyPicker settings={settings} />
        </div>
        {view.warnings.length > 0 && <WarningChips chips={view.warnings} />}
        {view.now ? <CurrentPeriod period={view.now} /> : <p className="mt-auto text-lg font-semibold text-white">{view.county}的天氣預報暫時無法讀取</p>}
        {view.reminder && <RainReminder reminder={view.reminder} />}
      </div>
      <WeatherStats view={view} />
    </Scene>
  );
}

/** 溫度是整張卡片最大的字 其他都比它小 */
function CurrentPeriod({ period }: { period: PeriodView }) {
  return (
    <div className="mt-auto flex flex-col gap-1">
      {period.temperature && <p className="text-5xl font-bold tracking-tight text-white tabular-nums @md:text-6xl">{period.temperature}</p>}
      <p className="flex flex-wrap items-baseline gap-x-2.5 text-lg font-semibold text-white">
        <span>{period.description}</span>
        {period.comfort && <span className="text-base font-normal text-white/90">{period.comfort}</span>}
      </p>
    </div>
  );
}

const REMINDER_ICONS = { umbrella: "umbrella", maybe: "umbrella", dry: "umbrella-off" } as const satisfies Record<RainLevel, UiIconName>;

/** 要帶傘時是實心的黃色 看一眼就知道 其他是半透明的 */
function RainReminder({ reminder }: { reminder: Reminder }) {
  const warn = reminder.level === "umbrella";
  return (
    <p className={`flex w-fit max-w-full flex-wrap items-center gap-x-2 rounded-xl px-3 py-1.5 ${warn ? "bg-amber-300 text-amber-950" : "scene-button font-normal"}`}>
      <Icon name={REMINDER_ICONS[reminder.level]} className="size-5 shrink-0" />
      <span className="font-bold">{reminder.title}</span>
      <span className="text-sm tabular-nums">{reminder.detail}</span>
    </p>
  );
}

function Stat({ label, sub, children }: { label: string; sub?: string | null; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 px-3 py-3 first:pl-5 last:pr-5 sm:px-4 sm:first:pl-6 sm:last:pr-6">
      <dt className="text-sm text-white/90">{label}</dt>
      <dd className="flex flex-col gap-0.5 font-semibold text-white tabular-nums">
        {children}
        {sub && <span className="text-sm font-normal break-words text-white/90">{sub}</span>}
      </dd>
    </div>
  );
}

/** 空氣品質不好時用標籤 平常只寫等級 */
function airLevel(air: NonNullable<WeatherView["air"]>) {
  return air.warn ? <span className="w-fit rounded-md bg-amber-300 px-1.5 text-amber-950">{air.level}</span> : air.level;
}

/** 欄數照有幾項 沒設環境部的授權碼時只有兩欄 */
function WeatherStats({ view: { now, next, air } }: { view: WeatherView }) {
  if (!now && !next && air === undefined) return null;
  return (
    <dl className="grid auto-cols-fr grid-flow-col divide-x divide-white/25 border-t border-white/25 bg-black/40">
      {now && <Stat label="降雨機率">{now.rain === null ? "—" : `${now.rain}%`}</Stat>}
      {next && (
        <Stat label={next.label} sub={[next.description, next.rain === null ? null : `降雨 ${next.rain}%`].filter(Boolean).join(" ")}>
          {next.temperature ?? "—"}
        </Stat>
      )}
      {air !== undefined && (
        <Stat label="空氣品質" sub={air && [`AQI ${air.aqi}`, air.site, air.time].filter(Boolean).join(" ")}>
          {air ? airLevel(air) : "暫時無法讀取"}
        </Stat>
      )}
    </dl>
  );
}

/** 跟有提醒與空氣品質時差不多高 串流進來時下面的卡片才不會跳 */
function WeatherSkeleton() {
  return (
    <LoadingState label="載入天氣…" className={SCENE_FRAME}>
      <Skeleton className="h-full min-h-88 rounded-2xl" />
    </LoadingState>
  );
}
