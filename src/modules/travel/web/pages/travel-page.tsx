import Link from "next/link";
import { Suspense } from "react";
import { requireModule } from "@/core/auth";
import type { ModuleInfo } from "@/core/module";
import { taipeiDateKey } from "@/core/time";
import { EmptyState } from "@/core/ui/empty-state";
import { Icon } from "@/core/ui/icon";
import { PageBanner } from "@/core/ui/page-banner";
import { ListSkeleton } from "@/core/ui/skeleton";
import { tripHref } from "../../lib/urls";
import { cachedTrips } from "../../service/cached";
import { NewTripButton } from "../components/trip-form";
import { dateRange, tripStatus } from "../trip-view";

export const TRAVEL_BANNER = "/images/scenes/banner-travel.svg";

// web 層不能 import 模組根目錄 所以 info 由 src/app 傳進來
export function TravelPage({ info }: { info: ModuleInfo }) {
  return (
    <div data-accent={info.accent} className="page-stack">
      <PageBanner image={TRAVEL_BANNER} icon={<Icon src={info.icon} />} title={info.name} actions={<NewTripButton />} />
      <Suspense fallback={<ListSkeleton rows={3} label="載入旅程…" />}>
        <TripList />
      </Suspense>
    </div>
  );
}

export async function TripList() {
  const user = await requireModule("travel");
  const trips = await cachedTrips(user.id);
  if (trips.length === 0) return <EmptyState icon="plane" title="還沒有旅程" hint="新增一趟旅程，再把群組連結傳給同行的人" />;
  const today = taipeiDateKey(new Date());
  return (
    <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {trips.map((trip) => (
        <li key={trip.id}>
          <Link href={tripHref(trip.id)} className="card flex h-full flex-col gap-1 transition-colors hover:border-[var(--line-strong)]">
            <p className="text-lg font-semibold break-words text-ink">{trip.title}</p>
            <p className="text-ink-soft tabular-nums">{[trip.destination, dateRange(trip)].filter(Boolean).join("，")}</p>
            <p className="flex flex-wrap items-center gap-2 pt-1">
              <span className="chip chip-accent">{tripStatus(trip, today)}</span>
              <span className="chip tabular-nums">{trip.memberCount} 人</span>
            </p>
          </Link>
        </li>
      ))}
    </ul>
  );
}
