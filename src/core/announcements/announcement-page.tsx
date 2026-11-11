import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { requireSession } from "../auth";
import { Icon } from "../ui/icon";
import { PageBanner } from "../ui/page-banner";
import { CardHeader } from "../ui/page-header";
import { LoadingState, Skeleton } from "../ui/skeleton";
import { AnnouncementRows } from "./announcement-rows";
import { cachedAnnouncements } from "./cached";
import { ANNOUNCEMENT_KIND_ICONS } from "./kind-icons";
import { ANNOUNCEMENT_KIND_LABELS, announcementWhen, isAnnouncementShown } from "./rules";

// 網址的編號只收正整數 01 這種寫法也不認 一則只有一個網址
const ID_PATTERN = /^[1-9]\d{0,9}$/;

type AnnouncementPageProps = { params: Promise<{ id: string }> };

/** 使用者要的 首頁的公告點進去是一個頁面 一則一頁 */
export function AnnouncementPage({ params }: AnnouncementPageProps) {
  return (
    <div className="page-stack">
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

  return (
    <>
      <PageBanner
        image="/images/scenes/banner-announcements.svg"
        icon={<Icon name={ANNOUNCEMENT_KIND_ICONS[row.kind]} />}
        title={row.title}
        actions={
          <Link href="/#home-announcements" className="scene-button">
            回首頁
          </Link>
        }
      >
        <p className="announcement-facts">
          <span className="font-semibold text-white">{ANNOUNCEMENT_KIND_LABELS[row.kind]}</span>
          <span className="inline-flex items-center gap-1.5 tabular-nums">
            <Icon name="clock" className="size-4" />
            {announcementWhen(row)}
          </span>
        </p>
      </PageBanner>
      <div className={others.length > 0 ? "grid items-start gap-8 xl:grid-cols-[minmax(0,1fr)_24rem]" : "page-stack"}>
        <article aria-label="公告內文" data-kind={row.kind} className="card announcement-article">
          <p className="announcement-text">{row.body === "" ? "沒有其他說明" : row.body}</p>
        </article>
        {others.length > 0 && (
          <section aria-labelledby="other-announcements" className="card stack min-w-0">
            <CardHeader id="other-announcements" icon={<Icon name="megaphone" />}>
              其他公告
            </CardHeader>
            <AnnouncementRows rows={others} />
          </section>
        )}
      </div>
    </>
  );
}

function AnnouncementSkeleton() {
  return (
    <LoadingState label="載入公告…" className="page-stack">
      <Skeleton className="h-40 rounded-2xl" />
      <Skeleton className="h-48 rounded-2xl" />
    </LoadingState>
  );
}
