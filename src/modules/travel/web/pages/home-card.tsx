import Link from "next/link";
import { requireModule } from "@/core/auth";
import type { ModuleInfo } from "@/core/module";
import { taipeiDateKey } from "@/core/time";
import { EmptyState } from "@/core/ui/empty-state";
import { HomeCard } from "@/core/ui/home-card";
import { LoadingState, Skeleton } from "@/core/ui/skeleton";
import { TRAVEL_HREF, tripHref } from "../../lib/urls";
import { cachedNextTrip } from "../../service/cached";
import { dateRange, tripStatus } from "../trip-view";

// web 層不能 import 模組根目錄 所以 info 由 src/app 傳進來
export function TravelHomeCard({ info }: { info: ModuleInfo }) {
  return (
    <HomeCard info={info} title="下一趟旅程" art="/images/scenes/banner-travel.svg" skeleton={<NextTripSkeleton />}>
      <NextTrip />
    </HomeCard>
  );
}

export async function NextTrip() {
  const user = await requireModule("travel");
  const today = taipeiDateKey(new Date());
  const trip = await cachedNextTrip(user.id, today);
  if (!trip) {
    return (
      <EmptyState
        compact
        icon="plane"
        title="還沒有旅程"
        action={
          <Link href={TRAVEL_HREF} className="btn-secondary">
            新增旅程
          </Link>
        }
      />
    );
  }
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

function NextTripSkeleton() {
  return (
    <LoadingState label="載入旅程…" className="flex min-h-14 flex-col justify-center gap-2">
      <Skeleton className="h-5 w-40" />
      <Skeleton className="h-4 w-28" />
    </LoadingState>
  );
}
