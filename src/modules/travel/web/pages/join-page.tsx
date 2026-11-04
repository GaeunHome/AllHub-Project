import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { requireModule } from "@/core/auth";
import type { ModuleInfo } from "@/core/module";
import { Icon } from "@/core/ui/icon";
import { PageBanner } from "@/core/ui/page-banner";
import { ListSkeleton } from "@/core/ui/skeleton";
import { TRAVEL_HREF, tripHref } from "../../lib/urls";
import { joinPreview } from "../../service/trips";
import { JoinForm } from "../components/join-form";
import { dateRange } from "../trip-view";
import { TRAVEL_BANNER } from "./travel-page";

type JoinPageProps = { info: ModuleInfo; params: Promise<{ id: string; token: string }> };

export function JoinPage({ info, params }: JoinPageProps) {
  return (
    <div data-accent={info.accent} className="page-stack">
      <PageBanner image={TRAVEL_BANNER} icon={<Icon src={info.icon} />} title="加入旅程" />
      <Suspense fallback={<ListSkeleton rows={1} label="檢查連結…" />}>
        <JoinBody params={params} />
      </Suspense>
    </div>
  );
}

/** 每次直接讀 連結撤銷後要馬上失效 不走快取 */
export async function JoinBody({ params }: Pick<JoinPageProps, "params">) {
  const user = await requireModule("travel");
  const { id, token } = await params;
  const tripId = Number(id);
  if (!Number.isInteger(tripId) || tripId <= 0) notFound();
  const preview = await joinPreview(user.id, tripId, token);
  if (!preview) {
    return (
      <section className="card stack">
        <p className="font-semibold text-ink">這個連結已經失效</p>
        <Link href={TRAVEL_HREF} className="link w-fit">
          回到我的旅程
        </Link>
      </section>
    );
  }
  return (
    <section className="card stack">
      <div>
        <p className="text-xl font-semibold break-words text-ink">{preview.title}</p>
        <p className="text-ink-soft tabular-nums">{[preview.destination, dateRange(preview)].filter(Boolean).join("，")}</p>
      </div>
      {preview.alreadyMember ? (
        <Link href={tripHref(tripId)} className="btn-primary self-start">
          你已經在這趟旅程裡了，打開行程
        </Link>
      ) : (
        <JoinForm tripId={tripId} token={token} />
      )}
    </section>
  );
}
