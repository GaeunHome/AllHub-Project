import { Suspense } from "react";
import { Icon } from "../ui/icon";
import { PageHeader, SectionTitle } from "../ui/page-header";
import { LoadingState, Skeleton } from "../ui/skeleton";
import { requireSession } from ".";
import { logout } from "./actions";
import { ChangePasswordForm } from "./change-password-form";

export function AccountPage() {
  return (
    <div className="flex flex-col gap-8">
      <PageHeader icon={<Icon name="circle-user-round" />} title="帳號" subtitle="變更登入密碼；新增帳號只能在電腦上用 npm run account create" />
      <Suspense fallback={<AccountSkeleton />}>
        <AccountSections />
      </Suspense>
    </div>
  );
}

async function AccountSections() {
  const user = await requireSession();

  return (
    <>
      <section className="card flex flex-wrap items-center gap-4">
        <span className="icon-tile size-12 rounded-full">
          <Icon name="circle-user-round" />
        </span>
        <div className="min-w-40 flex-1">
          <p className="text-sm text-muted">目前登入的帳號</p>
          <p className="text-lg font-semibold text-ink">{user.username}</p>
        </div>
        <form action={logout}>
          <button className="btn-secondary">
            <Icon name="log-out" className="size-4" />
            登出這台裝置
          </button>
        </form>
      </section>

      <section>
        <SectionTitle icon="key-round">變更密碼</SectionTitle>
        <div className="card">
          <ChangePasswordForm username={user.username} />
        </div>
      </section>

      <section>
        <SectionTitle icon="shield-check">忘記密碼或要登出所有裝置</SectionTitle>
        <div className="card flex flex-col gap-2 text-sm leading-relaxed text-ink-soft">
          <p>
            在電腦上執行 <code>npm run account -- passwd {user.username}</code> 重設密碼，所有裝置都會被登出。
          </p>
          <p className="text-muted">網站不提供註冊與忘記密碼的信件，避免公開的網址被別人拿來搶帳號。</p>
        </div>
      </section>
    </>
  );
}

function AccountSkeleton() {
  return (
    <LoadingState className="flex flex-col gap-8">
      <div className="card flex items-center gap-4">
        <Skeleton className="size-12 shrink-0 rounded-full" />
        <div className="flex flex-1 flex-col gap-2">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-5 w-32" />
        </div>
      </div>
      <div className="card flex flex-col gap-4">
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="h-11 rounded-full" />
        ))}
      </div>
    </LoadingState>
  );
}
