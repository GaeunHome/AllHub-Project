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

/** 只有站長能用：每個讀資料的區塊與 Server Action 都會用 requireOwner 再確認（導覽列的入口只是不顯示） */
export function AdminPage() {
  return (
    <div className="page-stack">
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

/** 建立邀請的表單在上、已建立的邀請在下（撐滿卡片左右的清單） */
export async function InviteSection() {
  await requireOwner();
  // 狀態（有效、過期）要用這次請求的時間算，預先抓取時不能先算好
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
  // 鎖定有沒有到期要用這次請求的時間判斷，預先抓取時不能先算好
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
