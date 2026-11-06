import Link from "next/link";
import { Suspense } from "react";
import { ROLE_LABELS } from "../db/schema";
import { Icon } from "../ui/icon";
import { InfoTip } from "../ui/info-tip";
import { PageBanner } from "../ui/page-banner";
import { CardHeader } from "../ui/page-header";
import { LoadingState, Skeleton } from "../ui/skeleton";
import { UserAvatar } from "../ui/user-avatar";
import { requireSession } from ".";
import { logout } from "./actions";
import { AvatarButton } from "./avatar-button";
import { ChangePasswordForm } from "./change-password-form";
import { DeleteAccountForm } from "./delete-account-form";
import { displayNameOf } from "./nickname";
import { NicknameButton } from "./nickname-button";

export function AccountPage() {
  return (
    // 寬螢幕分兩欄 不把輸入框拉滿整個畫面
    <div className="page-stack xl:grid xl:grid-cols-2 xl:items-start">
      <PageBanner image="/images/scenes/banner-account.svg" icon={<Icon name="circle-user-round" />} title="帳號" className="xl:col-span-2">
        <Suspense fallback={<ProfileSkeleton />}>
          <AccountProfile />
        </Suspense>
      </PageBanner>
      <Suspense fallback={<AccountSkeleton />}>
        <AccountSections />
      </Suspense>
    </div>
  );
}

/** 名片放在橫幅上 沒選範例頭像時顏色跟著帳號名稱 */
export async function AccountProfile() {
  const user = await requireSession();
  const name = displayNameOf(user);
  return (
    <section className="flex flex-wrap items-center gap-4">
      <UserAvatar username={user.username} name={name} size="lg" avatar={user.avatar} />
      <div className="flex min-w-40 flex-1 flex-col gap-1">
        <p className="flex flex-wrap items-center gap-2 text-2xl font-bold text-white">
          <span className="break-all">{name}</span>
          <span className={user.role === "owner" ? "chip chip-brand" : "chip"}>{ROLE_LABELS[user.role]}</span>
        </p>
        {user.nickname && <p className="break-all text-white/90">帳號名稱：{user.username}</p>}
      </div>
      <div className="button-row">
        <AvatarButton username={user.username} name={name} avatar={user.avatar} />
        <NicknameButton nickname={user.nickname} />
        <form action={logout}>
          <button className="btn-secondary">
            <Icon name="log-out" className="size-4" />
            登出這台裝置
          </button>
        </form>
      </div>
    </section>
  );
}

export async function AccountSections() {
  const user = await requireSession();
  const isOwner = user.role === "owner";

  return (
    <>
      <section aria-labelledby="account-password" className="card stack">
        <CardHeader id="account-password" icon={<Icon name="key-round" />}>
          <span className="inline-flex items-center gap-1">
            變更密碼
            <InfoTip label="忘記密碼或要登出所有裝置">
              {/* 只有站長拿得到資料庫的連線字串 成員只能請站長重設 */}
              {isOwner ? (
                <>
                  忘記密碼用 <code>npm run account -- passwd {user.username}</code> 重設，所有裝置會登出
                </>
              ) : (
                "忘記密碼請找站長重設，改密碼會登出其他裝置"
              )}
            </InfoTip>
          </span>
        </CardHeader>
        <ChangePasswordForm username={user.username} />
      </section>

      {/* 危險的動作不跟一般設定放在同一種外框 一條紅線標出來 平常收著 */}
      <section aria-labelledby="account-delete" className="danger-zone">
        <h2 id="account-delete" className="flex items-center gap-1 text-lg font-semibold text-ink">
          刪除帳號
          <InfoTip label="刪除帳號的說明">
            {isOwner ? "資料全部刪除且無法復原，唯一的站長不能刪除自己" : "資料全部刪除且無法復原，共用的翻譯會留下"}
          </InfoTip>
        </h2>
        <details className="disclosure">
          <summary>我要刪除這個帳號</summary>
          <div className="stack">
            <Link href="/terms" className="link w-fit">
              使用聲明
            </Link>
            <DeleteAccountForm username={user.username} />
          </div>
        </details>
      </section>
    </>
  );
}

function ProfileSkeleton() {
  return (
    <LoadingState className="flex items-center gap-4">
      <Skeleton className="size-20 shrink-0 rounded-full" />
      <div className="flex flex-1 flex-col gap-2">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-4 w-28" />
      </div>
    </LoadingState>
  );
}

/** 骨架照內容的格線排 載入完才不會從一欄跳成兩欄 */
function AccountSkeleton() {
  return (
    <LoadingState className="page-stack xl:col-span-2 xl:grid xl:grid-cols-2 xl:items-start">
      <div className="card stack">
        <CardHeaderSkeleton />
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="field">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-11 rounded-lg" />
          </div>
        ))}
        <Skeleton className="h-11 w-32 rounded-lg" />
      </div>
      <div className="stack">
        <Skeleton className="h-7 w-24" />
        <Skeleton className="h-6 w-40" />
      </div>
    </LoadingState>
  );
}

function CardHeaderSkeleton() {
  return (
    <div className="flex items-center gap-3">
      <Skeleton className="size-9 shrink-0 rounded-xl" />
      <Skeleton className="h-5 w-24" />
    </div>
  );
}
