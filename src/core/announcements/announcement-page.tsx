import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { requireSession } from "../auth";
import { formatTaipeiMonthDay } from "../time";
import { BackLink } from "../ui/back-link";
import { Icon } from "../ui/icon";
import { CardHeader } from "../ui/page-header";
import { LoadingState, Skeleton } from "../ui/skeleton";
import { AnnouncementRows } from "./announcement-rows";
import { AnnouncementStamp } from "./announcement-stamp";
import { cachedAnnouncements } from "./cached";
import { ANNOUNCEMENT_KIND_ICONS } from "./kind-icons";
import { ANNOUNCEMENT_KIND_LABELS, announcementTimeline, isAnnouncementShown } from "./rules";

// 網址的編號只收正整數 01 這種寫法也不認 一則只有一個網址
const ID_PATTERN = /^[1-9]\d{0,9}$/;

type AnnouncementPageProps = { params: Promise<{ id: string }> };

/** 使用者要的 首頁的公告點進去是一個頁面 一則一頁 使用者選的站長來信 置中一欄像一封信 */
export function AnnouncementPage({ params }: AnnouncementPageProps) {
  return (
    <div className="announcement-page">
      <Suspense fallback={<AnnouncementSkeleton />}>
        <AnnouncementBody params={params} />
      </Suspense>
    </div>
  );
}

/** 刪掉的 結束時間過了的與網址亂打的都是找不到頁面 */
export async function AnnouncementBody({ params }: AnnouncementPageProps) {
  await requireSession();
  // 結束時間過了要馬上找不到 所以用這次請求的時間算
  await connection();
  const raw = (await params).id;
  const now = new Date();
  const shown = ID_PATTERN.test(raw) ? (await cachedAnnouncements()).filter((row) => isAnnouncementShown(row, now)) : [];
  const row = shown.find((item) => item.id === Number(raw));
  if (!row) notFound();
  const others = shown.filter((item) => item.id !== row.id);
  const timeline = announcementTimeline(row, now);

  return (
    <>
      <BackLink href="/#home-announcements">回首頁</BackLink>
      <article aria-labelledby="announcement-title" data-kind={row.kind} className="announcement-letter">
        <header className="announcement-letterhead">
          <p className="flex items-center gap-2.5 font-semibold text-ink">
            <span aria-hidden="true" className="logo-mark size-8">
              <Icon name="flower-2" className="size-[1.125rem]" />
            </span>
            AllHub 站長公告
          </p>
          <AnnouncementStamp kind={row.kind} />
        </header>
        <div className="flex flex-col gap-3">
          <p className="announcement-kind">
            <Icon name={ANNOUNCEMENT_KIND_ICONS[row.kind]} className="size-4" />
            {ANNOUNCEMENT_KIND_LABELS[row.kind]}
          </p>
          <h1 id="announcement-title" className="announcement-title">
            {row.title}
          </h1>
        </div>
        {timeline && <Timeline timeline={timeline} />}
        <p className="announcement-text">{row.body === "" ? "沒有其他說明" : row.body}</p>
        <footer className="announcement-sign">
          <span className="text-lg font-bold text-ink">站長</span>
          <span className="text-ink-soft tabular-nums">{formatTaipeiMonthDay(row.createdAt)} 公布</span>
        </footer>
      </article>
      {others.length > 0 && (
        <section aria-labelledby="other-announcements" className="card stack min-w-0">
          <CardHeader id="other-announcements" icon={<Icon name="megaphone" />}>
            其他公告
          </CardHeader>
          <AnnouncementRows rows={others} />
        </section>
      )}
    </>
  );
}

/** 公布 開始 結束三步 下一步圈起來 */
function Timeline({ timeline }: { timeline: NonNullable<ReturnType<typeof announcementTimeline>> }) {
  return (
    <section aria-label="時間" className="announcement-timeline">
      <p className="announcement-timeline-status">
        <Icon name="clock" className="size-4" />
        {timeline.status}
      </p>
      <ol className="announcement-steps">
        {timeline.steps.map((step) => (
          <li key={step.label} data-state={step.state} className="announcement-step">
            <span aria-hidden="true" className="announcement-step-dot" />
            <span className="font-semibold text-ink">{step.label}</span>
            <span className="text-ink-soft tabular-nums">{step.time}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

function AnnouncementSkeleton() {
  return (
    <LoadingState label="載入公告…" className="announcement-page">
      <Skeleton className="h-6 w-20" />
      <Skeleton className="h-96 rounded-[1.25rem]" />
    </LoadingState>
  );
}
