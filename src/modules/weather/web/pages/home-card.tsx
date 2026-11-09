import Image from "next/image";
import type { ReactNode } from "react";
import { requireModule } from "@/core/auth";
import type { ModuleInfo } from "@/core/module";
import { HomeCard } from "@/core/ui/home-card";
import { Icon, type UiIconName } from "@/core/ui/icon";
import { InfoTip } from "@/core/ui/info-tip";
import { Scene } from "@/core/ui/scene";
import { LoadingState, Skeleton } from "@/core/ui/skeleton";
import type { RainLevel } from "../../lib/rain";
import { nextDayHours } from "../../lib/weekly";
import { cachedCountyHours, cachedForecast, cachedSettings, cachedStations, cachedWarnings } from "../../service/cached";
import type { WeatherSettings } from "../../service/settings";
import { weatherKeys } from "../../service/weather";
import { CountyPicker } from "../components/county-picker";
import { TileImage, WeatherImage } from "../components/weather-images";
import { weatherView, type PeriodView, type Reminder, type WeatherArt, type WeatherView } from "../weather-view";
import { hourColumn, type HourColumn } from "../weekly-view";

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
  // 每小時跟天氣頁的接下來 24 小時共用同一份快取
  const [forecast, stations, warnings, hours] = await Promise.all([
    cachedForecast(settings.county),
    keys.airQuality ? cachedStations() : undefined,
    cachedWarnings(settings.county),
    cachedCountyHours(settings.county),
  ]);
  const soon = nextDayHours(hours ?? [], now, TAIPEI_OFFSET_SECONDS).slice(0, HOURS_SHOWN).map(hourColumn);
  return <WeatherBody view={weatherView(settings.county, forecast, stations, now, warnings)} hours={soon} settings={settings} />;
}

const TAIPEI_OFFSET_SECONDS = 8 * 3600;
// 右邊空著的地方放接下來幾小時 使用者要填滿卡片
const HOURS_SHOWN = 6;
const SCENE_FRAME = "flex h-full min-h-88 flex-col";

/** 還沒有天氣可以看 一樣用晴天的圖 版面才不會空一塊 */
function WeatherPrompt({ title, hint, action }: { title: string; hint: string; action?: ReactNode }) {
  return (
    <Scene src="/images/scenes/weather-clear-day.svg" eager className={`${SCENE_FRAME} items-start justify-end gap-3 p-5 sm:p-6`}>
      <div className="flex flex-col gap-1">
        <p className="text-xl font-bold text-white">{title}</p>
        <p className="text-white">{hint}</p>
      </div>
      {action}
    </Scene>
  );
}

/** 上面是今天的樣子 右邊是接下來幾小時 下面一條是數字 所有縣市都排在同樣的位置 */
function WeatherBody({ view, hours, settings }: { view: WeatherView; hours: HourColumn[]; settings: WeatherSettings }) {
  return (
    <Scene src={view.scene} eager className={SCENE_FRAME}>
      <div className="flex flex-1 flex-col gap-3 p-5 sm:p-6">
        <div className="flex items-center gap-1.5">
          <p className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 font-semibold text-white">
            <Icon name="map-pin" className="size-4 shrink-0" />
            <span>{view.county}</span>
            {view.now && <span className="font-normal">{view.now.label}</span>}
          </p>
          {/* 政府資料開放授權條款要標示出處 */}
          <InfoTip label="天氣資料的來源">
            資料來源：中央氣象署{view.air !== undefined && "、環境部"}
          </InfoTip>
          <CountyPicker settings={settings} />
        </div>
        {view.warnings.map((warning) => (
          <p key={warning.label} className="flex items-center gap-2 font-semibold text-white">
            <TileImage art="warning" />
            <span>
              {warning.label}
              {warning.until && <span className="font-normal"> {warning.until}</span>}
            </span>
          </p>
        ))}
        <div className="mt-auto flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
          <div className="flex min-w-0 flex-col gap-3">
            {view.now ? <CurrentPeriod period={view.now} /> : <p className="text-lg font-semibold text-white">{view.county}的天氣預報暫時無法讀取</p>}
            {view.reminder && <RainReminder reminder={view.reminder} />}
          </div>
          {hours.length > 0 && <NextHours hours={hours} />}
        </div>
      </div>
      <WeatherStats view={view} />
    </Scene>
  );
}

/** 溫度是整張卡片最大的字 旁邊是這一段的天氣圖 */
function CurrentPeriod({ period }: { period: PeriodView }) {
  return (
    <div className="flex items-center gap-3">
      <WeatherImage art={period.art} alt="" size={72} />
      <div className="flex min-w-0 flex-col gap-1">
        {period.temperature && <p className="text-5xl font-bold tracking-tight text-white tabular-nums @md:text-6xl">{period.temperature}</p>}
        <p className="flex flex-wrap items-baseline gap-x-2.5 text-lg font-semibold text-white">
          <span>{period.description}</span>
          {period.comfort && <span className="text-base font-normal">{period.comfort}</span>}
        </p>
      </div>
    </div>
  );
}

const REMINDER_ICONS = { umbrella: "umbrella", maybe: "umbrella", dry: "umbrella-off" } as const satisfies Record<RainLevel, UiIconName>;

/** 使用者不要小標籤 跟特報一樣是圖加白字 */
function RainReminder({ reminder }: { reminder: Reminder }) {
  return (
    <p className="flex max-w-full flex-wrap items-center gap-x-2 text-white">
      <Icon name={REMINDER_ICONS[reminder.level]} className="size-6 shrink-0" />
      <span className="text-lg font-bold">{reminder.title}</span>
      <span className="tabular-nums">{reminder.detail}</span>
    </p>
  );
}

/** 寬的時候放在溫度右邊 底下墊一層深色 亮的天空上白字才讀得到 */
function NextHours({ hours }: { hours: HourColumn[] }) {
  return (
    <ol aria-label="接下來幾小時" className="hidden rounded-2xl bg-black/35 p-2 backdrop-blur-sm @2xl:flex">
      {hours.map((hour) => (
        <li key={hour.time} className="flex w-14 flex-col items-center gap-1 py-1 text-white tabular-nums">
          <span className="text-sm">{hour.clock}</span>
          <WeatherImage art={hour.art} alt={hour.weather ?? ""} size={32} />
          <span className="font-semibold">{hour.temperature === null ? "—" : `${hour.temperature}°`}</span>
          {hour.rain !== null && <span className="text-sm">{hour.rain}%</span>}
        </li>
      ))}
    </ol>
  );
}

/** 使用者選的左字右大圖 大數字與說明在左 右邊一張大圖補滿格子 */
/** lines 一項一行 格子窄時才不會從中間斷開 */
function Stat({ label, art, lines = [], children }: { label: string; art: StatArt | null; lines?: (string | null)[]; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 border-t border-l border-white/25 px-4 py-3 sm:px-5">
      <dt className="text-sm text-white">{label}</dt>
      <dd className="flex items-center gap-3 text-white tabular-nums">
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-2xl font-semibold">{children}</span>
          {lines.filter(Boolean).map((line) => (
            <span key={line} className="text-sm break-words">
              {line}
            </span>
          ))}
        </span>
        {art && <Image src={`/images/weather/${art}.png`} alt="" width={44} height={44} unoptimized className="shrink-0" />}
      </dd>
    </div>
  );
}

type StatArt = WeatherArt | "droplet" | "leaf" | "mask";

/** 一段的溫度 下面是天氣與降雨機率 */
function PeriodStat({ period }: { period: PeriodView }) {
  return (
    <Stat label={period.label} art={period.art} lines={[period.description, period.rain === null ? null : `降雨 ${period.rain}%`]}>
      {period.temperature ?? "—"}
    </Stat>
  );
}

/** 手機兩欄兩列 寬的時候一排 格子的左邊與上面畫線 外框裁掉最外面那一圈 */
function WeatherStats({ view: { now, next, later, air } }: { view: WeatherView }) {
  if (!now && !next && air === undefined) return null;
  return (
    <div className="overflow-hidden border-t border-white/25 bg-black/40">
      <dl className="-mt-px -ml-px grid grid-cols-2 @2xl:auto-cols-fr @2xl:grid-flow-col @2xl:grid-cols-none">
        {now && (
          <Stat label="降雨機率" art="droplet" lines={[now.label]}>
            {now.rain === null ? "—" : `${now.rain}%`}
          </Stat>
        )}
        {next && <PeriodStat period={next} />}
        {later && <PeriodStat period={later} />}
        {air !== undefined && (
          <Stat label="空氣品質" art={air?.warn ? "mask" : "leaf"} lines={air ? [`AQI ${air.aqi}`, [air.site, air.time].filter(Boolean).join(" ")] : []}>
            {air ? air.level : "暫時無法讀取"}
          </Stat>
        )}
      </dl>
    </div>
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
