import Link from "next/link";
import { Suspense } from "react";
import { Icon } from "../ui/icon";
import { CardHeader, PageHeader } from "../ui/page-header";
import { LoadingState, Skeleton } from "../ui/skeleton";
import { requireSession } from ".";
import { logout } from "./actions";
import { ChangePasswordForm } from "./change-password-form";
import { DeleteAccountForm } from "./delete-account-form";

export function AccountPage() {
  return (
    <div className="page-stack">
      <PageHeader icon={<Icon name="circle-user-round" />} title="帳號" />
      <Suspense fallback={<AccountSkeleton />}>
        <AccountSections />
      </Suspense>
    </div>
  );
}

export async function AccountSections() {
  const user = await requireSession();
  const isOwner = user.role === "owner";

  return (
    <>
      <section className="card flex flex-wrap items-center gap-4">
        <span className="icon-tile size-12 rounded-full">
          <Icon name="circle-user-round" />
        </span>
        <div className="flex min-w-40 flex-1 flex-col gap-1">
          <p className="text-sm text-ink-soft">目前登入的帳號</p>
          <p className="flex flex-wrap items-center gap-2 text-lg font-semibold text-ink">
            {user.username}
            <span className={isOwner ? "chip chip-brand" : "chip"}>{isOwner ? "站長" : "成員"}</span>
          </p>
        </div>
        <form action={logout}>
          <button className="btn-secondary">
            <Icon name="log-out" className="size-4" />
            登出這台裝置
          </button>
        </form>
      </section>

      <section aria-labelledby="account-password" className="card stack">
        <CardHeader id="account-password" icon={<Icon name="key-round" />}>
          變更密碼
        </CardHeader>
        <ChangePasswordForm username={user.username} />
      </section>

      <section aria-labelledby="account-reset" className="card stack">
        <CardHeader id="account-reset" icon={<Icon name="shield-check" />}>
          忘記密碼或要登出所有裝置
        </CardHeader>
        <div className="flex flex-col gap-2 leading-relaxed">
          {/* 只有站長拿得到資料庫的連線字串，成員只能請站長重設 */}
          {isOwner ? (
            <p>
              在電腦上執行 <code>npm run account -- passwd {user.username}</code> 重設密碼（也會解除登入鎖定），所有裝置都會被登出。
            </p>
          ) : (
            <p>忘記密碼時請聯絡站長重設；重設後所有裝置都會被登出。要登出其他裝置，變更一次密碼就可以了。</p>
          )}
          <p>網站只能用站長的邀請連結註冊，也不寄送忘記密碼的信件，避免公開的網址被拿來灌帳號或搶帳號。</p>
        </div>
      </section>

      <section aria-labelledby="account-delete" className="card stack">
        <CardHeader id="account-delete" icon={<Icon name="trash-2" />}>
          刪除帳號
        </CardHeader>
        <div className="flex flex-col gap-2 leading-relaxed">
          <p>刪除後無法復原：帳號會被刪除，你建立的邀請連結也會一起刪除。</p>
          {isOwner && <p>站長帳號至少要留一個：唯一的站長不能刪除自己。</p>}
        </div>
        <details className="disclosure">
          <summary>其他功能的資料呢？</summary>
          <p className="leading-relaxed">
            刪除帳號時，追蹤名單、加密的 API Key 與 HoYoLAB cookie、記帳資料會一起刪除，共用的翻譯留下但不再連到你。保存哪些資料見
            <Link href="/terms" className="link">
              使用聲明
            </Link>
            。
          </p>
        </details>
        <DeleteAccountForm username={user.username} />
      </section>
    </>
  );
}

function AccountSkeleton() {
  return (
    <LoadingState className="page-stack">
      <div className="card flex items-center gap-4">
        <Skeleton className="size-12 shrink-0 rounded-full" />
        <div className="flex flex-1 flex-col gap-2">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-5 w-32" />
        </div>
      </div>
      <div className="card stack">
        <div className="flex items-center gap-3">
          <Skeleton className="size-9 shrink-0 rounded-xl" />
          <Skeleton className="h-5 w-24" />
        </div>
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="h-11 rounded-lg" />
        ))}
      </div>
    </LoadingState>
  );
}
