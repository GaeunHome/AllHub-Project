import { connection } from "next/server";
import { Suspense } from "react";
import { logError } from "../errors";
import { Icon } from "../ui/icon";
import { Skeleton } from "../ui/skeleton";
import { LoginForm } from "./login-form";
import { hasAnyUser } from "./users";

export function LoginPage() {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-12">
      <div className="card w-full max-w-sm px-6 py-9 text-center sm:px-9 sm:py-11">
        <span className="logo-mark size-16">
          <Icon name="flower-2" className="size-8" />
        </span>
        <h1 className="text-gradient mt-5 text-3xl font-bold tracking-tight">AllHub</h1>
        <p className="mt-1.5 text-sm text-muted">歡迎回來，輸入帳號和密碼就能開始囉</p>
        <Suspense fallback={<LoginFormSkeleton />}>
          <LoginGate />
        </Suspense>
      </div>
    </main>
  );
}

/** 還沒有帳號時只顯示說明：網站是公開的，提供網頁註冊可能被別人先搶走帳號 */
export async function LoginGate() {
  await connection();
  return (await hasAccounts()) ? <LoginForm /> : <NoAccountNotice />;
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
    <div className="mt-7 flex flex-col gap-3 text-left">
      <p role="status" className="notice">
        <Icon name="info" />
        <span>
          尚未建立帳號，請在電腦執行 <code className="whitespace-nowrap">npm run account create</code>
        </span>
      </p>
      <p className="text-xs leading-relaxed text-muted">建立後重新整理這一頁就能登入。為了安全，網站不提供註冊。</p>
    </div>
  );
}

function LoginFormSkeleton() {
  return (
    <div role="status" aria-busy="true" className="mt-7 flex flex-col gap-3">
      <span className="sr-only">載入中…</span>
      <Skeleton className="h-11 rounded-full" />
      <Skeleton className="h-11 rounded-full" />
      <Skeleton className="mt-1 h-11 rounded-full" />
    </div>
  );
}
