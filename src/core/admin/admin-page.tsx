import { connection } from "next/server";
import { Suspense } from "react";
import { requireOwner } from "../auth";
import { Icon } from "../ui/icon";
import { CardHeader, PageHeader } from "../ui/page-header";
import { ListSkeleton, LoadingState, Skeleton } from "../ui/skeleton";
import { cachedInvites, cachedUsers } from "./cached";
import { CreateInviteForm } from "./create-invite-form";
import { InviteList } from "./invite-list";
import { listLockedUsers } from "./service";
import { UserList } from "./user-list";

/** 導覽列只是藏起入口 讀資料與 Server Action 都會用 requireOwner 再確認 */
export function AdminPage() {
  return (
    // 寬螢幕兩欄等寬 不把表單拉滿整個畫面 邀請清單每列才不會擠成三行
    <div className="page-stack xl:grid xl:grid-cols-2 xl:items-start xl:[&>:first-child]:col-span-2">
      <PageHeader icon={<Icon name="shield-check" />} title="管理" />

      <section aria-labelledby="admin-invites" className="card stack">
        <CardHeader id="admin-invites" icon={<Icon name="link" />}>
          邀請連結
        </CardHeader>
        <Suspense fallback={<InviteSectionSkeleton />}>
          <InviteSection />
        </Suspense>
      </section>

      <section aria-labelledby="admin-users" className="card stack">
        <CardHeader id="admin-users" icon={<Icon name="users" />}>
          使用者
        </CardHeader>
        <Suspense fallback={<ListSkeleton rows={3} label="載入使用者…" />}>
          <UserSection />
        </Suspense>
      </section>
    </div>
  );
}

export async function InviteSection() {
  await requireOwner();
  // 有效或過期要用這次請求的時間算 預先抓取時不能先算好
  await connection();
  const invites = await cachedInvites();
  return (
    <>
      <CreateInviteForm />
      <InviteList invites={invites} now={new Date()} />
    </>
  );
}

export async function UserSection() {
  const owner = await requireOwner();
  // 鎖定是否到期要用這次請求的時間算 預先抓取時不能先算好
  await connection();
  const [users, locked] = await Promise.all([cachedUsers(), listLockedUsers(new Date())]);
  return <UserList users={users} currentUserId={owner.id} lockedUntil={new Map(locked.map((user) => [user.id, user.lockedUntil]))} />;
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
