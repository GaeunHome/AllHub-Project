import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { requireOwner } from "../auth";
import type { ModuleInfo } from "../module";
import { FOCUS_FRAME } from "../ui/focus-frame";
import { Icon } from "../ui/icon";
import { NoticeItem, NoticeStrip } from "../ui/notice-strip";
import { PageBanner } from "../ui/page-banner";
import { CardHeader } from "../ui/page-header";
import { ListSkeleton, LoadingState, Skeleton } from "../ui/skeleton";
import { cachedAnnouncements } from "../announcements/cached";
import { inviteStatus } from "../auth/invites";
import { displayNameOf } from "../auth/nickname";
import { formatTaipeiHourMinute } from "../time";
import { AnnouncementList } from "./announcement-list";
import { cachedInvites, cachedUsers } from "./cached";
import { CreateInviteForm } from "./create-invite-form";
import { InviteList } from "./invite-list";
import { ModuleAccessTable } from "./module-access-table";
import { listLockedUsers, listModuleDenials } from "./service";
import { UserList } from "./user-list";

/** 導覽列只是藏起入口 讀資料與 Server Action 都會用 requireOwner 再確認 */
export function AdminPage({ modules }: { modules: ModuleInfo[] }) {
  return (
    // 寬螢幕兩欄等寬 不把表單拉滿整個畫面 邀請清單每列才不會擠成三行
    <div className="page-stack xl:grid xl:grid-cols-2 xl:items-start">
      <PageBanner image="/images/scenes/banner-admin.svg" icon={<Icon name="shield-check" />} title="管理" className="xl:col-span-2" actions={
          <>
            <Link href="/admin/status" className="scene-button">
              系統狀態
            </Link>
            <Link href="/admin/logs" className="scene-button">
              操作紀錄
            </Link>
          </>
        }
      >
        {/* 數字等確認是站長才讀 成員打開這一頁時先出現的外框只有標題 */}
        <Suspense fallback={<div className="h-14" />}>
          <AdminStats />
        </Suspense>
      </PageBanner>

      <Suspense fallback={null}>
        <LockedNotices />
      </Suspense>

      {/* 排欄寫在兩欄各自的外框上 右邊的邀請比較高 左邊放使用者與權限才不會空一塊 */}
      <div className="page-stack min-w-0">
        {/* 刪掉一個帳號後那一列不見 焦點落在這張卡片 */}
        <section aria-labelledby="admin-users" {...FOCUS_FRAME} className="card stack">
          <CardHeader id="admin-users" icon={<Icon name="users" />}>
            使用者
          </CardHeader>
          <Suspense fallback={<ListSkeleton rows={3} label="載入使用者…" />}>
            <UserSection />
          </Suspense>
        </section>

        {/* 標題也在裡面 成員打開這一頁時先出現的外框不能有權限的字 */}
        <Suspense fallback={<ModuleAccessSkeleton />}>
          <ModuleAccessSection modules={modules} />
        </Suspense>

        {/* 刪掉最後一則後清單不見 焦點落在這張卡片 */}
        <section aria-labelledby="admin-announcements" {...FOCUS_FRAME} className="card stack">
          <CardHeader id="admin-announcements" icon={<Icon name="bell" />}>
            公告
          </CardHeader>
          <Suspense fallback={<ListSkeleton rows={2} label="載入公告…" />}>
            <AnnouncementSection />
          </Suspense>
        </section>
      </div>

      <section aria-labelledby="admin-invites" className="card stack">
        <CardHeader id="admin-invites" icon={<Icon name="link" />}>
          邀請連結
        </CardHeader>
        <Suspense fallback={<InviteSectionSkeleton />}>
          <InviteSection modules={modules} />
        </Suspense>
      </section>
    </div>
  );
}

/** 站長最常想知道的三個數字 放在圖上一眼看完 */
export async function AdminStats() {
  await requireOwner();
  await connection();
  const now = new Date();
  const [users, invites, locked] = await Promise.all([cachedUsers(), cachedInvites(), listLockedUsers(now)]);
  const stats = [
    { label: "使用者", value: users.length },
    { label: "有效邀請", value: invites.filter((invite) => inviteStatus(invite, now) === "active").length },
    { label: "鎖定中", value: locked.length },
  ];
  return (
    <dl className="flex flex-wrap gap-x-10 gap-y-3">
      {stats.map((stat) => (
        <div key={stat.label} className="flex flex-col">
          <dt className="text-white/90">{stat.label}</dt>
          <dd className="text-3xl font-bold text-white tabular-nums">{stat.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** 有帳號被鎖住時才出現 不用往下找清單 */
export async function LockedNotices() {
  const owner = await requireOwner();
  await connection();
  const [users, locked] = await Promise.all([cachedUsers(), listLockedUsers(new Date())]);
  const names = new Map(users.map((user) => [user.id, displayNameOf(user)]));
  const others = locked.filter((user) => user.id !== owner.id);
  if (others.length === 0) return null;
  return (
    <NoticeStrip label="要注意" className="xl:col-span-2">
      {others.map((user) => (
        <NoticeItem key={user.id} tone="warning" title={names.get(user.id) ?? "帳號"} detail={`鎖定中，到 ${formatTaipeiHourMinute(user.lockedUntil)}`} />
      ))}
    </NoticeStrip>
  );
}

export async function AnnouncementSection() {
  await requireOwner();
  // 有沒有結束要用這次請求的時間算 預先讀取時不能先算好
  await connection();
  return <AnnouncementList rows={await cachedAnnouncements()} now={new Date()} />;
}

export async function InviteSection({ modules }: { modules: ModuleInfo[] }) {
  await requireOwner();
  // 有效或過期要用這次請求的時間算 預先讀取時不能先算好
  await connection();
  const invites = await cachedInvites();
  return (
    <>
      <CreateInviteForm modules={modules} />
      <InviteList invites={invites} now={new Date()} modules={modules} />
    </>
  );
}

export async function UserSection() {
  const owner = await requireOwner();
  // 鎖定是否到期要用這次請求的時間算 預先讀取時不能先算好
  await connection();
  const [users, locked] = await Promise.all([cachedUsers(), listLockedUsers(new Date())]);
  return <UserList users={users} currentUserId={owner.id} lockedUntil={new Map(locked.map((user) => [user.id, user.lockedUntil]))} />;
}

export async function ModuleAccessSection({ modules }: { modules: ModuleInfo[] }) {
  await requireOwner();
  const [users, denials] = await Promise.all([cachedUsers(), listModuleDenials()]);
  return (
    <section aria-labelledby="admin-modules" className="card stack min-w-0">
      <CardHeader id="admin-modules" icon={<Icon name="shield" />}>
        模組權限
      </CardHeader>
      <ModuleAccessTable users={users} modules={modules} denials={denials} />
    </section>
  );
}

function ModuleAccessSkeleton() {
  return (
    <div className="card">
      <ListSkeleton rows={3} />
    </div>
  );
}

function InviteSectionSkeleton() {
  return (
    <>
      <LoadingState label="載入邀請連結…" className="stack">
        {[0, 1].map((i) => (
          <div key={i} className="field">
            <Skeleton className="h-4 w-24" />
            <div className="grid grid-cols-3 gap-2">
              {[0, 1, 2].map((j) => (
                <Skeleton key={j} className="h-11 rounded-xl" />
              ))}
            </div>
          </div>
        ))}
        <Skeleton className="h-11 rounded-lg" />
        <Skeleton className="h-11 w-36 rounded-lg" />
      </LoadingState>
      <ListSkeleton rows={2} />
    </>
  );
}
