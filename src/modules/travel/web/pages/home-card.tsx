import Link from "next/link";
import { requireModule } from "@/core/auth";
import type { ModuleInfo } from "@/core/module";
import { taipeiDateKey } from "@/core/time";
import { HomeCard } from "@/core/ui/home-card";
import { LoadingState, Skeleton } from "@/core/ui/skeleton";
import { tripHref } from "../../lib/urls";
import { cachedTodayTrip } from "../../service/cached";
import { dateRange, tripStatus } from "../trip-view";

async function loadTodayTrip() {
  const user = await requireModule("travel");
  const today = taipeiDateKey(new Date());
  return { today, trip: await cachedTodayTrip(user.id, today) };
}

/** 使用者要的 今天沒有行程時首頁不出現這張卡片 */
export async function travelCardShown(): Promise<boolean> {
  return (await loadTodayTrip()).trip !== null;
}

// web 層不能 import 模組根目錄 所以 info 由 src/app 傳進來
export function TravelHomeCard({ info }: { info: ModuleInfo }) {
  return (
    <HomeCard info={info} title="今天的行程" art="/images/scenes/banner-travel.svg" skeleton={<TodayTripSkeleton />}>
      <TodayTrip />
    </HomeCard>
  );
}

export async function TodayTrip() {
  const { today, trip } = await loadTodayTrip();
  if (!trip) return null;
  return (
    <Link href={tripHref(trip.id)} className="home-row -mx-2">
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="font-semibold break-words text-ink">{trip.title}</span>
        <span className="text-ink-soft tabular-nums">{[trip.destination, dateRange(trip)].filter(Boolean).join("，")}</span>
      </span>
      <span className="chip chip-accent shrink-0">{tripStatus(trip, today)}</span>
    </Link>
  );
}

function TodayTripSkeleton() {
  return (
    <LoadingState label="載入旅程…" className="flex min-h-14 flex-col justify-center gap-2">
      <Skeleton className="h-5 w-40" />
      <Skeleton className="h-4 w-28" />
    </LoadingState>
  );
}
