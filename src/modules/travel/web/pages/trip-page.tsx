import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { requireModule } from "@/core/auth";
import type { ModuleInfo } from "@/core/module";
import { taipeiDateKey } from "@/core/time";
import { Icon } from "@/core/ui/icon";
import { InfoTip } from "@/core/ui/info-tip";
import { PageBanner } from "@/core/ui/page-banner";
import { LoadingState, Skeleton } from "@/core/ui/skeleton";
import { TRAVEL_HREF } from "../../lib/urls";
import { cachedTrip } from "../../service/cached";
import { ExpensePanel } from "../components/expense-panel";
import { TodayCard } from "../components/today-card";
import { TripBoard } from "../components/trip-board";
import { TripMenu } from "../components/trip-menu";
import { TripRefresh } from "../components/trip-refresh";
import { Checklist, Members } from "../components/trip-side";
import { expenseBoard } from "../expense-view";
import { tripText } from "../trip-text";
import { dateRange, dayViews, tripStatus } from "../trip-view";
import { TRAVEL_BANNER } from "./travel-page";

type TripPageProps = { info: ModuleInfo; params: Promise<{ id: string }> };

const SERIAL_MAX = 2_147_483_647;

export function TripPage({ info, params }: TripPageProps) {
  return (
    <div data-accent={info.accent} className="page-stack">
      <Suspense fallback={<TripSkeleton />}>
        <TripBody info={info} params={params} />
      </Suspense>
    </div>
  );
}

/** 不是成員跟不存在一樣 都是找不到頁面 */
export async function TripBody({ info, params }: TripPageProps) {
  const user = await requireModule("travel");
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0 || id > SERIAL_MAX) notFound();
  const trip = await cachedTrip(user.id, id);
  if (!trip) notFound();
  const today = taipeiDateKey(new Date());
  const days = dayViews(trip);

  return (
    <>
      <TripRefresh />
      <PageBanner
        image={TRAVEL_BANNER}
        icon={<Icon src={info.icon} />}
        title={
          <span className="inline-flex flex-wrap items-center gap-x-1">
            {trip.title}
            <InfoTip label="行程怎麼用">拖曳把手調整順序，時間會自動重算</InfoTip>
          </span>
        }
        actions={
          <>
            <Link href={TRAVEL_HREF} className="scene-button">
              所有旅程
            </Link>
            <TripMenu trip={trip} isManager={trip.managerId === user.id} copyText={tripText(trip, days, trip.items)} />
          </>
        }
      >
        <p className="font-medium text-white tabular-nums">{[trip.destination, dateRange(trip), tripStatus(trip, today)].filter(Boolean).join("，")}</p>
      </PageBanner>
      <TodayCard days={days} items={trip.items} destination={trip.destination} expected={today >= trip.startDate && today <= trip.endDate} />
      <TripBoard tripId={trip.id} tripTitle={trip.title} destination={trip.destination} days={days} items={trip.items} comments={trip.comments} userId={user.id} managerId={trip.managerId} />
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Members tripId={trip.id} members={trip.members} managerId={trip.managerId} userId={user.id} joinPath={trip.joinPath} />
        <Checklist tripId={trip.id} checks={trip.checks} />
        <ExpensePanel tripId={trip.id} userId={user.id} members={trip.members} board={expenseBoard(trip, user.id)} />
      </div>
    </>
  );
}

function TripSkeleton() {
  return (
    <LoadingState label="載入行程…" className="page-stack">
      <Skeleton className="h-40 rounded-2xl" />
      <div className="flex gap-4 overflow-hidden">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-72 w-72 shrink-0 rounded-2xl" />
        ))}
      </div>
    </LoadingState>
  );
}
