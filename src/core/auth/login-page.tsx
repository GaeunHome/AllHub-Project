import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { logError } from "../errors";
import { Icon } from "../ui/icon";
import { Skeleton } from "../ui/skeleton";
import { AuthCard } from "./auth-card";
import { LoginForm } from "./login-form";
import { captchaImageUrl } from "./messages";
import { hasAnyUser } from "./users";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export function LoginPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <AuthCard title="AllHub">
      <Suspense fallback={null}>
        <DeletedNotice searchParams={searchParams} />
      </Suspense>
      <Suspense fallback={<LoginFormSkeleton />}>
        <LoginGate />
      </Suspense>
      <LoginFooter />
    </AuthCard>
  );
}

/** 刪除帳號後導回這裡：cookie 已經刪掉，只用網址參數說明發生了什麼事 */
export async function DeletedNotice({ searchParams }: { searchParams: SearchParams }) {
  if ((await searchParams).deleted !== "1") return null;
  return (
    <p role="status" className="notice">
      <Icon name="circle-check" />
      <span>帳號已刪除。謝謝你用過 AllHub。</span>
    </p>
  );
}

export function LoginFooter() {
  return (
    <p className="text-center leading-relaxed">
      還沒有帳號？請向站長索取邀請連結。
      <Link href="/terms" className="link whitespace-nowrap">
        使用聲明
      </Link>
    </p>
  );
}

/** 還沒有帳號時只顯示說明：第一個帳號（站長）只能在電腦上建立，網站公開的註冊頁需要站長發的邀請 */
export async function LoginGate() {
  await connection();
  return (await hasAccounts()) ? <LoginForm captchaSrc={captchaImageUrl("login")} /> : <NoAccountNotice />;
}

async function hasAccounts(): Promise<boolean> {
  try {
    return await hasAnyUser();
  } catch (error) {
    // 查不到資料庫時照樣顯示表單，登入時會再回「暫時無法登入」；log 只記錯誤種類
    logError("auth", "查詢帳號時發生錯誤", error);
    return true;
  }
}

function NoAccountNotice() {
  return (
    <div className="stack">
      <p role="status" className="notice">
        <Icon name="info" />
        <span>
          尚未建立帳號，請在電腦執行 <code className="whitespace-nowrap">npm run account create</code>
        </span>
      </p>
      <p className="leading-relaxed">建立後重新整理這一頁就能登入。第一個帳號（站長）要在電腦上建立，之後的人用站長的邀請連結註冊。</p>
    </div>
  );
}

function LoginFormSkeleton() {
  return (
    <div role="status" aria-busy="true" className="stack">
      <span className="sr-only">載入中…</span>
      <Skeleton className="h-11 rounded-lg" />
      <Skeleton className="h-11 rounded-lg" />
      <Skeleton className="h-[60px] w-[170px] rounded-xl" />
      <Skeleton className="h-11 rounded-lg" />
      <Skeleton className="h-11 rounded-lg" />
    </div>
  );
}
