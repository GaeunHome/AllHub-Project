import { requireSession } from "@/core/auth";
import type { ModuleInfo } from "@/core/module";
import { EmptyState } from "@/core/ui/empty-state";
import { Fact, FactList } from "@/core/ui/fact-list";
import { HomeCard } from "@/core/ui/home-card";
import { Icon, type UiIconName } from "@/core/ui/icon";
import { LoadingState, Skeleton } from "@/core/ui/skeleton";
import type { RainLevel } from "../../lib/rain";
import { cachedForecast, cachedSettings, cachedStations } from "../../service/cached";
import type { WeatherSettings } from "../../service/settings";
import { weatherKeys } from "../../service/weather";
import { CountyPicker, SettingsResult } from "../components/county-picker";
import { weatherView, type PeriodView, type Reminder, type WeatherView } from "../weather-view";

// web 層不能 import 模組根目錄 所以 info 由 src/app 傳進來
export function WeatherHomeCard({ info }: { info: ModuleInfo }) {
  return (
    <HomeCard info={info} title="天氣" skeleton={<WeatherSkeleton />}>
      {/* 每一種狀態都包在裡面 沒有授權碼的說明也是 存好的訊息才不會跟著空狀態不見 */}
      <SettingsResult>
        <WeatherSnapshot />
      </SettingsResult>
    </HomeCard>
  );
}

export async function WeatherSnapshot() {
  const user = await requireSession();
  const settings = await cachedSettings(user.id);
  if (settings === null) {
    return <EmptyState compact icon="map-pin" title="選擇所在的縣市" hint="首頁會顯示那裡的天氣與空氣品質，會下雨時提醒帶傘" action={<CountyPicker settings={null} />} />;
  }
  const keys = weatherKeys();
  if (!keys.forecast) {
    return <EmptyState compact icon="cloud-sun" title="還沒設定氣象署的授權碼" hint="站長在 Vercel 的環境變數加上 CWA_API_KEY 就會顯示" />;
  }
  const now = new Date();
  const [forecast, stations] = await Promise.all([cachedForecast(settings.county), keys.airQuality ? cachedStations() : undefined]);
  return <WeatherBody view={weatherView(settings.county, forecast, stations, now)} settings={settings} />;
}

/**
 * 卡片內容 656px 以上時提醒放在現在這一段的旁邊 一樣高 撐到右邊線
 * 再窄的話十來個字的天氣描述會擠成兩行 所以排到下面
 */
const NOW_ROW = "grid gap-4 @min-[41rem]:grid-cols-[auto_minmax(14rem,1fr)] @min-[41rem]:gap-x-6";

function WeatherBody({ view, settings }: { view: WeatherView; settings: WeatherSettings }) {
  return (
    <div className="stack">
      {view.now ? (
        <div className={view.reminder ? NOW_ROW : undefined}>
          <CurrentPeriod county={view.county} period={view.now} />
          {view.reminder && <RainReminder reminder={view.reminder} />}
        </div>
      ) : (
        <EmptyState compact icon="cloud" title={`${view.county}的天氣預報暫時讀不到`} hint="幾分鐘後會再試" />
      )}
      <FactList>
        {view.next && (
          <Fact label={view.next.label} layout="line" className="first:pt-0">
            <span className="flex min-w-0 items-center gap-1.5">
              <Icon name={view.next.icon} className="size-4 shrink-0" />
              <span className="truncate">{view.next.description}</span>
            </span>
            <span className="shrink-0 tabular-nums">{[view.next.rain === null ? null : `降雨 ${view.next.rain}%`, view.next.temperature].filter(Boolean).join(" · ")}</span>
          </Fact>
        )}
        {view.air !== undefined && (
          <Fact label="空氣品質" layout="line" className="first:pt-0">
            {view.air === null ? (
              <span>暫時讀不到</span>
            ) : (
              <span className="flex flex-wrap items-center justify-end gap-x-2">
                <span className={view.air.warn ? "chip chip-warning" : "font-medium"}>{view.air.level}</span>
                <span className="tabular-nums text-ink-soft">
                  AQI {view.air.aqi} · {view.air.site}
                  {view.air.time && ` ${view.air.time}`}
                </span>
              </span>
            )}
          </Fact>
        )}
      </FactList>
      <div className="flex flex-wrap items-center justify-between gap-2">
        {/* 政府資料開放授權條款要標示出處 */}
        <p className="text-sm text-ink-soft">資料來源：中央氣象署{view.air !== undefined && "、環境部"}</p>
        <CountyPicker settings={settings} />
      </div>
    </div>
  );
}

/** 手機與平板的半張卡片不到 384px 圖示與溫度小一號 縣市與時段才不會擠成兩行 */
function CurrentPeriod({ county, period }: { county: string; period: PeriodView }) {
  return (
    <div className="flex items-center gap-3 @sm:gap-4">
      <span className="icon-tile size-12 shrink-0 rounded-2xl [&>.icon]:size-7 @sm:size-14 @sm:[&>.icon]:size-8">
        <Icon name={period.icon} />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="text-sm text-ink-soft">
          {county} · {period.label}
        </p>
        <p className="text-lg font-semibold text-ink">{period.description}</p>
        <p className="text-sm text-ink-soft tabular-nums">{[period.rain === null ? null : `降雨機率 ${period.rain}%`, period.comfort].filter(Boolean).join(" · ")}</p>
      </div>
      {period.temperature && <p className="shrink-0 text-2xl font-bold tracking-tight tabular-nums text-ink @sm:text-3xl">{period.temperature}</p>}
    </div>
  );
}

const REMINDER_ICONS = { umbrella: "umbrella", maybe: "umbrella", dry: "umbrella-off" } as const satisfies Record<RainLevel, UiIconName>;

/**
 * 要帶傘時用跟警示標籤同一組顏色 其他是中性的 高度跟現在這一段的三行字一樣
 * 排在下面時圖示與文字對齊上面的天氣圖示與文字 並排時用一般的內距
 */
function RainReminder({ reminder }: { reminder: Reminder }) {
  const warn = reminder.level === "umbrella";
  return (
    <div className={`panel flex items-center gap-3 border py-3 pr-4 pl-0 @sm:gap-4 @min-[41rem]:gap-3 @min-[41rem]:pl-4 ${warn ? "border-[var(--warning-line)] bg-[var(--warning-soft)]" : "border-line"}`}>
      {/* 跟天氣圖示一樣寬 負邊距抵掉框線 */}
      <span className="-ml-px grid w-12 shrink-0 place-items-center @sm:w-14 @min-[41rem]:ml-0 @min-[41rem]:w-auto">
        <Icon name={REMINDER_ICONS[reminder.level]} className={`size-6 ${warn ? "text-warning" : "text-ink-soft"}`} />
      </span>
      <div className="flex min-w-0 flex-col gap-0.5">
        <p className="font-semibold text-ink">{reminder.title}</p>
        <p className="text-sm text-ink-soft tabular-nums">{reminder.detail}</p>
      </div>
    </div>
  );
}

/** 一行字的高度 骨架的長條放在裡面置中 */
function SkeletonLine({ height, bar }: { height: string; bar: string }) {
  return (
    <div className={`flex items-center ${height}`}>
      <Skeleton className={bar} />
    </div>
  );
}

/** 跟有提醒與空氣品質時一樣高 各種寬度都是 串流進來時下面的卡片才不會跳 */
function WeatherSkeleton() {
  return (
    <LoadingState label="載入天氣…" className="stack">
      <div className={NOW_ROW}>
        <div className="flex items-center gap-3 @sm:gap-4">
          <Skeleton className="size-12 shrink-0 rounded-2xl @sm:size-14" />
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <SkeletonLine height="h-5" bar="h-3.5 w-24" />
            <SkeletonLine height="h-7" bar="h-5 w-36" />
            <SkeletonLine height="h-5" bar="h-3.5 w-28" />
          </div>
          <Skeleton className="h-8 w-16 shrink-0 @sm:h-9 @sm:w-20" />
        </div>
        <Skeleton className="h-18 rounded-xl" />
      </div>
      <div className="flex flex-col divide-y divide-line">
        {["w-40", "w-44"].map((width) => (
          <div key={width} className="flex min-h-11 items-center justify-between gap-3 py-2 first:pt-0">
            <Skeleton className="h-4 w-14" />
            <Skeleton className={`h-4 ${width}`} />
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between gap-2">
        <Skeleton className="h-4 w-44" />
        <Skeleton className="h-9 w-16 rounded-lg pointer-coarse:h-11" />
      </div>
    </LoadingState>
  );
}
